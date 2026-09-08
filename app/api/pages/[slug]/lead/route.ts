import { NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";
import { landingDocSchema, formBlockOf } from "@/lib/landing/blocks";

/**
 * A lead from a public landing page.
 *
 * The only unauthenticated WRITE this product has. Everything else sits behind
 * a session and `withWorkspace`, which is why none of the usual protections
 * apply here and all of them have to be built by hand:
 *
 * - `withWorkspace`'s rate limiter needs a session to scope by, so this uses
 *   the primitive underneath it directly, keyed on IP.
 * - The workspace is resolved FROM THE PAGE, never from the request. A caller
 *   cannot name a workspace to write into.
 * - Fields are filtered against the ones the page's own form block declares.
 *   An extra key in the body is dropped, not stored: without that, a public
 *   endpoint accepting arbitrary jsonb is free storage for whoever finds it.
 *
 * A honeypot plus a minimum fill time, and no third-party captcha. This is a
 * lead form on a small page, not a login — a captcha would cost more real
 * submissions than the bots it stops.
 */

const bodySchema = z.object({
  fields: z.record(z.string(), z.string().max(2000)).default({}),
  /** Honeypot. A human never sees this input, so anything in it is a bot. */
  website: z.string().max(200).optional(),
  /** ms since the form rendered. Humans do not fill a form in under 2s. */
  elapsedMs: z.number().int().nonnegative().max(86_400_000).optional(),
  source: z
    .object({
      referrer: z.string().max(500).optional(),
      utm_source: z.string().max(120).optional(),
      utm_medium: z.string().max(120).optional(),
      utm_campaign: z.string().max(120).optional(),
    })
    .default({}),
});

/** Accepted, and quietly discarded. Telling a bot it was caught teaches it. */
const ACCEPTED = NextResponse.json({ ok: true });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await ctx.params;

    if (!checkRateLimit(`lead:${getRateLimitKey(req)}`, 5, 60_000)) {
      return NextResponse.json(
        { error: "Too many submissions — try again in a minute." },
        { status: 429 },
      );
    }

    const body = bodySchema.parse(await req.json());

    // Both traps answer 200. A bot that learns which shape gets rejected
    // learns how to get through.
    if (body.website?.trim()) return ACCEPTED;
    if (body.elapsedMs !== undefined && body.elapsedMs < 2000) return ACCEPTED;

    const admin = createSupabaseAdminClient();
    const { data: pageRow } = await admin
      .from("landing_pages")
      .select("id, workspace_id, blocks, theme, style, title, description")
      .eq("slug", slug)
      .not("published_at", "is", null)
      .maybeSingle();

    // Same answer for "no such page" and "not published": a draft's URL should
    // not be discoverable by the shape of its rejection.
    if (!pageRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const page = pageRow as {
      id: string;
      workspace_id: string;
      blocks: unknown;
      theme: unknown;
      style: string;
      title: string;
      description: string;
    };

    const doc = landingDocSchema.safeParse({
      style: page.style,
      title: page.title,
      description: page.description,
      blocks: page.blocks,
      theme: page.theme,
    });
    const form = doc.success ? formBlockOf(doc.data) : null;
    if (!form) {
      return NextResponse.json(
        { error: "This page isn't collecting enquiries." },
        { status: 400 },
      );
    }

    // Keep only what the page asked for, and only if what it required is there.
    const clean: Record<string, string> = {};
    for (const field of form.fields) {
      const value = (body.fields[field.name] ?? "").trim();
      if (field.required && !value) {
        return NextResponse.json(
          { error: `${field.label} is required.` },
          { status: 400 },
        );
      }
      if (value) clean[field.name] = value.slice(0, 2000);
    }
    if (Object.keys(clean).length === 0) {
      return NextResponse.json(
        { error: "Nothing was filled in." },
        { status: 400 },
      );
    }

    const { error } = await admin.from("page_leads").insert({
      page_id: page.id,
      // From the page, never from the request body.
      workspace_id: page.workspace_id,
      fields: clean,
      source: body.source,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, message: form.successMessage });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "That submission couldn't be read." },
        { status: 400 },
      );
    }
    Sentry.captureException(err);
    // A lead that fails to save must not look like it saved.
    return NextResponse.json(
      { error: "Something went wrong sending that. Please try again." },
      { status: 500 },
    );
  }
}
