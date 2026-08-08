import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { isEnabled } from "@/lib/flags";
import { briefRequestSchema } from "@/lib/brief/schema";
import { assessBrief } from "@/lib/claude/brief-agent";
import { recordDecision } from "@/lib/learning/record";

/**
 * POST /api/campaigns/brief — assess a campaign prompt before anything is
 * generated. Slice 1 of the guided-brief work; dark-launched behind
 * FEATURE_BRIEF_AGENT so the live flow is untouched until it's ready.
 *
 * **Deliberately free, unlike every other Claude route here.** Charging a user
 * to be told their prompt is vague is hostile, and the whole point is that
 * people use it every time. One call is roughly a US cent, and abuse is capped
 * by the wrapper's rate limit rather than by credits — so there is no
 * `debitCredits`, and therefore (per app/api/CLAUDE.md) no `creative_jobs` row
 * to hang a refund off. If this ever becomes expensive enough to charge for,
 * it needs the job-row pattern adding at the same time.
 */
export const POST = withWorkspace(
  async (req, { db, session }) => {
    if (!isEnabled("briefAgent")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const parsed = briefRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Context the model uses to SKIP asks the workspace can already satisfy —
    // being asked for a logo you've already uploaded is the fastest way to make
    // an assistant feel stupid.
    const [{ data: kit }, { count: galleryCount }] = await Promise.all([
      db
        .from("brand_kits")
        .select("logo_url, primary_color")
        .limit(1)
        .maybeSingle(),
      db
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("type", "image"),
    ]);
    const brandKit = kit as {
      logo_url: string | null;
      primary_color: string | null;
    } | null;

    try {
      const { assessment, actualCostUsd } = await assessBrief({
        ...parsed.data,
        hasBrandKit: !!brandKit?.primary_color,
        hasLogo: !!brandKit?.logo_url,
        hasGalleryImages: (galleryCount ?? 0) > 0,
      });

      // Structure only — see lib/learning/record.ts on what is never stored.
      void recordDecision(db, session.workspaceId, "brief_assessed", {
        promptLength: parsed.data.prompt.length,
        promptWords: parsed.data.prompt.trim().split(/\s+/).length,
        completeness: assessment.completeness,
        gapCount: assessment.gaps.length,
        assetAskCount: assessment.assetAsks.length,
        assetAskKinds: assessment.assetAsks.map((a) => a.kind),
      });

      return NextResponse.json({ assessment, actualCostUsd });
    } catch (err) {
      // A malformed model response must never block the user from generating.
      const msg = err instanceof Error ? err.message : "Assessment failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  },
  { rateLimit: 20 },
);
