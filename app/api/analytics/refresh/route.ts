import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ayrsharePostAnalytics } from "@/lib/ayrshare/client";
import { computeEngagementScore } from "@/lib/analytics/engagement";

// POST /api/analytics/refresh — Phase 7 v1 (PRODUCT_STRATEGY.md §4): pull
// fresh engagement numbers from Ayrshare for this workspace's recent
// published posts. Manually triggered, not scheduled — "even if it's just
// pulling basic impression data" was the explicit bar for a first version.
// Free: this reads analytics, it doesn't generate anything, so no credits.
const CANDIDATE_LIMIT = 50;
const REFRESH_LIMIT = 20;

interface PublishRecordRow {
  id: string;
  ayrshare_post_ids: Record<string, string> | null;
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const { data: ws } = await admin
      .from("workspaces")
      .select("ayrshare_profile_key")
      .eq("id", session.workspaceId)
      .single();
    const profileKey = (ws as { ayrshare_profile_key: string | null } | null)
      ?.ayrshare_profile_key;
    if (!profileKey) {
      return NextResponse.json(
        { error: "Connect your accounts in Settings → Social first." },
        { status: 400 },
      );
    }

    // Only Ayrshare-published platforms carry an id to look analytics up by
    // (Meta-direct posts have none) — filter in app code rather than a jsonb
    // inequality in the query, which is fragile across postgrest versions.
    const { data: records } = await admin
      .from("publish_records")
      .select("id, ayrshare_post_ids")
      .eq("workspace_id", session.workspaceId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(CANDIDATE_LIMIT);

    const candidates = ((records ?? []) as PublishRecordRow[])
      .filter((r) => Object.keys(r.ayrshare_post_ids ?? {}).length > 0)
      .slice(0, REFRESH_LIMIT);

    let refreshed = 0;
    for (const record of candidates) {
      const ids = record.ayrshare_post_ids ?? {};
      const perPlatform: Record<string, unknown> = {};
      let totalScore = 0;
      let scored = 0;

      for (const [platform, ayrshareId] of Object.entries(ids)) {
        try {
          const result = await ayrsharePostAnalytics(profileKey, ayrshareId);
          const platformData = result[platform] as
            | { analytics?: Record<string, unknown> }
            | undefined;
          if (platformData?.analytics) {
            const platformScore = computeEngagementScore(
              platform,
              platformData.analytics,
            );
            perPlatform[platform] = {
              raw: platformData.analytics,
              score: platformScore,
            };
            totalScore += platformScore;
            scored++;
          }
        } catch {
          // One platform's analytics failing (not yet available, expired,
          // etc.) shouldn't block the others for this same post.
        }
      }

      if (scored > 0) {
        await admin
          .from("publish_records")
          .update({
            analytics: {
              platforms: perPlatform,
              engagementScore: Math.round((totalScore / scored) * 100) / 100,
              fetchedAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id);
        refreshed++;
      }
    }

    return NextResponse.json({ checked: candidates.length, refreshed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status =
      msg === "Unauthorized" ? 401 : msg === "Not a workspace member" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
