import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { debitCredits } from "@/lib/credits/debit";
import { refundCredits } from "@/lib/credits/refund";
import {
  analyzeCampaignUrl,
  type PageContent,
} from "@/lib/claude/campaign-brief";
import { extractBrandSignals } from "@/lib/claude/brand-scrape";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

const schema = z.object({
  url: z.string().url().max(2000),
  userNotes: z.string().max(1000).default(""),
});

// Defaults brand_kits rows are created with (db/migrations — no CREATE TABLE
// in this repo, only ALTER TABLEs; confirmed live via Supabase). A kit that
// still matches all of these has never been customized, so it's safe to
// auto-apply a "Brand Brain" proposal without an explicit confirm step.
const DEFAULT_BRAND_KIT = {
  primary_color: "#6366f1",
  secondary_color: "#8b5cf6",
  accent_color: "#f59e0b",
  font_family: "Inter",
};

interface ResolvedField {
  value: string;
  source: "detected" | "ai_suggested";
}

function extractPageContent(html: string, url: string): PageContent {
  // Strip script/style blocks first
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const title =
    clean.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? url;

  const description =
    clean
      .match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})/i,
      )?.[1]
      ?.trim() ??
    clean
      .match(
        /<meta[^>]+content=["']([^"']{1,500})[^>]+name=["']description["']/i,
      )?.[1]
      ?.trim() ??
    clean
      .match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})/i,
      )?.[1]
      ?.trim() ??
    clean
      .match(
        /<meta[^>]+content=["']([^"']{1,500})[^>]+property=["']og:description["']/i,
      )?.[1]
      ?.trim() ??
    "";

  const ogImage =
    clean
      .match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i,
      )?.[1]
      ?.trim() ??
    clean
      .match(
        /<meta[^>]+content=["']([^"']+)[^>]+property=["']og:image["']/i,
      )?.[1]
      ?.trim();

  const headings: string[] = [];
  for (const m of clean.matchAll(/<h[1-3][^>]*>([^<]{2,200})<\/h[1-3]>/gi)) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text) headings.push(text);
    if (headings.length >= 15) break;
  }

  // Strip all remaining tags for body text
  const bodyText = clean
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();

  return { title, description, headings, bodyText, ogImage };
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = schema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    // Fetch the target URL with a browser-like UA and timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    let html: string;
    try {
      const res = await fetch(body.url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Tenfold-Bot/1.0; +https://tenfold.nz)",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) throw new Error(`Site returned ${res.status}`);
      html = await res.text();
    } finally {
      clearTimeout(timeout);
    }

    const page = extractPageContent(html, body.url);

    if (!page.title && !page.bodyText) {
      return NextResponse.json(
        {
          error:
            "Could not extract content from that URL. Try a different page or paste your description manually.",
        },
        { status: 422 },
      );
    }

    // "Brand Brain" (PRODUCT_STRATEGY.md §3/§4.6): charge before creating
    // anything, so an insufficient-credit attempt leaves no trace. Only once
    // the debit succeeds do we create a lightweight "receipt" campaign to
    // hang the creative_jobs row off — refund_credits() (db/migrations/0005)
    // looks up credits_charged by job id, and creative_jobs.campaign_id is
    // NOT NULL, but this action runs before any real campaign exists. The
    // real campaign gets created normally via the unchanged POST
    // /api/campaigns once the user picks an angle.
    const jobId = uuidv4();
    const debit = await debitCredits(
      session.workspaceId,
      jobId,
      "brand_import",
    );
    if (!debit.success) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const { data: campaign, error: campaignErr } = await admin
      .from("campaigns")
      .insert({
        workspace_id: session.workspaceId,
        created_by: session.userId,
        name: page.title.slice(0, 60) || "Website analysis",
        prompt: `[Brand Brain] ${body.url}`,
        status: "brief",
      })
      .select("id")
      .single();
    if (campaignErr || !campaign) {
      // Vanishingly rare (the debit RPC above just succeeded against the
      // same database) — not worth a compensating-transaction path for.
      throw new Error(campaignErr?.message ?? "Could not start analysis");
    }
    const campaignId = (campaign as { id: string }).id;

    await admin.from("creative_jobs").insert({
      id: jobId,
      campaign_id: campaignId,
      workspace_id: session.workspaceId,
      type: "brand_import",
      status: "queued",
      credits_charged: 8,
    });

    try {
      const signals = extractBrandSignals(html);
      const brief = await analyzeCampaignUrl(body.url, page, body.userNotes);

      const colorFields = [
        "primary_color",
        "secondary_color",
        "accent_color",
      ] as const;
      const suggestionByField = {
        primary_color: brief.brandSuggestion.primaryColor,
        secondary_color: brief.brandSuggestion.secondaryColor,
        accent_color: brief.brandSuggestion.accentColor,
      };
      const resolvedColors: Record<string, ResolvedField> = {};
      colorFields.forEach((field, i) => {
        const detected = signals.colors[i];
        resolvedColors[field] = detected
          ? { value: detected, source: "detected" }
          : { value: suggestionByField[field], source: "ai_suggested" };
      });
      const resolvedFont: ResolvedField = signals.fontFamily
        ? { value: signals.fontFamily, source: "detected" }
        : { value: brief.brandSuggestion.fontFamily, source: "ai_suggested" };

      const proposedBrandKit = {
        primary_color: resolvedColors.primary_color,
        secondary_color: resolvedColors.secondary_color,
        accent_color: resolvedColors.accent_color,
        font_family: resolvedFont,
        tagline: brief.businessSummary.slice(0, 200),
      };

      // Don't silently overwrite a brand kit the user has already customized
      // — auto-apply only when every color/font field is still at the
      // untouched default.
      const { data: existingKit } = await admin
        .from("brand_kits")
        .select("primary_color, secondary_color, accent_color, font_family")
        .eq("workspace_id", session.workspaceId)
        .maybeSingle();
      const isCustomized =
        !!existingKit &&
        (existingKit.primary_color !== DEFAULT_BRAND_KIT.primary_color ||
          existingKit.secondary_color !== DEFAULT_BRAND_KIT.secondary_color ||
          existingKit.accent_color !== DEFAULT_BRAND_KIT.accent_color ||
          existingKit.font_family !== DEFAULT_BRAND_KIT.font_family);

      let brandKitApplied = false;
      if (!isCustomized) {
        await admin.from("brand_kits").upsert(
          {
            workspace_id: session.workspaceId,
            primary_color: proposedBrandKit.primary_color.value,
            secondary_color: proposedBrandKit.secondary_color.value,
            accent_color: proposedBrandKit.accent_color.value,
            font_family: proposedBrandKit.font_family.value,
            tagline: proposedBrandKit.tagline,
            source_url: body.url,
            imported_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id" },
        );
        brandKitApplied = true;
      }

      await admin
        .from("creative_jobs")
        .update({ status: "completed" })
        .eq("id", jobId);

      return NextResponse.json({
        ...brief,
        campaignId,
        proposedBrandKit,
        brandKitApplied,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Brand analysis failed";
      await admin
        .from("creative_jobs")
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
      await refundCredits(jobId);
      throw e;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Unauthorized")
      return NextResponse.json({ error: msg }, { status: 401 });
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return NextResponse.json(
        { error: "The website took too long to respond." },
        { status: 408 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
