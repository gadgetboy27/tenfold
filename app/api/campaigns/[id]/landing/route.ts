import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { withWorkspace } from "@/lib/api/with-workspace";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { generateLandingPages } from "@/lib/landing/generate";
import { buildPageSlug, landingThemeSchema } from "@/lib/landing/blocks";
import { errorMessage } from "@/lib/api/error-message";

/**
 * The campaign's landing pages.
 *
 * GET lists them; POST writes three at once (docs/landing-pages-scope.md).
 * Three because the choice is strategic — an enquiry page, a story page and an
 * offer page are different documents, not three samples of one — and the same
 * "pick one of a set" gesture the anchor images already teach.
 *
 * Synchronous, unlike every fal generation here: this is one Claude call of a
 * few seconds with no webhook to wait on, so a job row + Realtime subscription
 * would be ceremony around a request that has already finished. The
 * creative_jobs row still gets written, because refund_credits() keys off a
 * job id and a charge with no job is a charge nothing can give back.
 */

const bodySchema = z.object({
  /** The caption going out with the ads — the promise the click was made on. */
  caption: z.string().max(4000).default(""),
});

interface CampaignRow {
  id: string;
  name: string | null;
  prompt: string | null;
  anchor_asset_id: string | null;
  publish_asset_id: string | null;
}

export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    const { data } = await db
      .from("landing_pages")
      .select(
        "id, slug, style, title, description, blocks, theme, published_at, created_at",
      )
      .eq("campaign_id", params.id)
      .order("created_at", { ascending: true });

    const pages = data ?? [];
    const ids = pages.map((p) => (p as { id: string }).id);

    // Lead counts in the same trip. The Page list is where someone asks "did
    // it work", and a page row with no number beside it can't answer.
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: leads } = await db
        .from("page_leads")
        .select("page_id")
        .in("page_id", ids);
      for (const l of (leads ?? []) as { page_id: string }[]) {
        counts.set(l.page_id, (counts.get(l.page_id) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      pages: pages.map((p) => {
        const row = p as { id: string };
        return { ...p, leadCount: counts.get(row.id) ?? 0 };
      }),
    });
  },
);

export const POST = withWorkspace<{ id: string }>(
  async (req, { db, admin, session, params }) => {
    const body = bodySchema.parse(await req.json().catch(() => ({})));

    const { data: campaignRow } = await db
      .from("campaigns")
      .select("id, name, prompt, anchor_asset_id, publish_asset_id")
      .eq("id", params.id)
      .maybeSingle();
    if (!campaignRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const campaign = campaignRow as CampaignRow;

    // Regeneration is allowed, hoarding isn't: three sets is nine pages and a
    // choice nobody can make. Delete one first.
    const { data: existing } = await db
      .from("landing_pages")
      .select("id")
      .eq("campaign_id", params.id);
    if ((existing?.length ?? 0) >= 6) {
      return NextResponse.json(
        {
          error:
            "This campaign already has six pages. Delete some before making more.",
        },
        { status: 409 },
      );
    }

    // ── The brand, snapshotted here rather than read at render time ──
    const { data: kit } = await db
      .from("brand_kits")
      .select("primary_color, accent_color, font_family, logo_url, tagline")
      .maybeSingle();
    const { data: workspace } = await admin
      .from("workspaces")
      .select("name")
      .eq("id", session.workspaceId)
      .maybeSingle();

    const k = (kit ?? {}) as {
      primary_color?: string;
      accent_color?: string;
      font_family?: string;
      logo_url?: string;
    };
    const theme = landingThemeSchema.parse({
      primary: k.primary_color ?? undefined,
      accent: k.accent_color ?? undefined,
      font: k.font_family ?? undefined,
      logoUrl: k.logo_url ?? "",
      businessName: (workspace as { name?: string } | null)?.name ?? "",
    });

    // ── The pictures ──
    // The hero is what's being published if a pick has been made, the anchor
    // otherwise: the page should open on the same image the ad did.
    const { data: assetRows } = await db
      .from("assets")
      .select("id, url, type, metadata")
      .eq("campaign_id", params.id)
      .order("created_at", { ascending: true });

    const images = (
      (assetRows ?? []) as {
        id: string;
        url: string;
        type: string;
        metadata: { kind?: string; hd?: boolean } | null;
      }[]
    ).filter(
      (a) =>
        (a.type === "image" || a.type === "composed_image") &&
        a.metadata?.kind !== "video_source" &&
        !a.metadata?.hd,
    );

    const preferredId = campaign.publish_asset_id ?? campaign.anchor_asset_id;
    const hero = images.find((a) => a.id === preferredId) ?? images[0];
    if (!hero) {
      return NextResponse.json(
        { error: "This campaign has no image to build a page around yet." },
        { status: 400 },
      );
    }

    // ── Charge, then write ──
    // Debit first so an insufficient-credit attempt leaves nothing behind.
    const jobId = uuidv4();
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "landing_pages",
    );
    if (!debit.success) {
      return NextResponse.json(
        {
          error: `Not enough credits — three pages cost ${CREDIT_COSTS.landing_pages} credits.`,
        },
        { status: 402 },
      );
    }

    const { error: jobErr } = await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: params.id,
      workspace_id: session.workspaceId,
      type: "landing_pages",
      status: "queued",
      credits_charged: CREDIT_COSTS.landing_pages,
    });
    if (jobErr) {
      // Nothing downstream can refund a charge with no job row to key off.
      await refundCredits(jobId);
      Sentry.captureException(new Error(jobErr.message));
      return NextResponse.json(
        { error: "Could not start the page build. Please try again." },
        { status: 500 },
      );
    }

    try {
      const { pages, actualCostUsd } = await generateLandingPages({
        campaignName: campaign.name ?? "Campaign",
        prompt: campaign.prompt ?? "",
        caption: body.caption,
        theme,
        heroImageUrl: hero.url,
        galleryImageUrls: images
          .filter((a) => a.id !== hero.id)
          .map((a) => a.url)
          .slice(0, 12),
      });

      const rows = pages.map((doc) => {
        const id = uuidv4();
        return {
          id,
          workspace_id: session.workspaceId,
          campaign_id: params.id,
          created_by: session.userId,
          // Entropy from the row's own id, so the slug is unique by
          // construction rather than by a check that can lose a race.
          slug: buildPageSlug(campaign.name ?? "page", id.replace(/-/g, "")),
          style: doc.style,
          title: doc.title,
          description: doc.description,
          blocks: doc.blocks,
          theme: doc.theme,
        };
      });

      const { data: inserted, error: insertErr } = await db
        .from("landing_pages")
        .insert(rows)
        .select(
          "id, slug, style, title, description, blocks, theme, published_at",
        );
      if (insertErr) throw new Error(insertErr.message);

      await admin
        .from("creative_jobs")
        .update({ status: "completed", actual_cost_usd: actualCostUsd })
        .eq("id", jobId);

      return NextResponse.json({
        pages: (inserted ?? []).map((p) => ({ ...p, leadCount: 0 })),
      });
    } catch (e) {
      const msg = errorMessage(e, "Could not write the pages");
      await admin
        .from("creative_jobs")
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
      await refundCredits(jobId);
      Sentry.captureException(e);
      return NextResponse.json(
        {
          error:
            "The pages couldn't be written this time — your credits have been returned.",
        },
        { status: 502 },
      );
    }
  },
  { rateLimit: 10 },
);
