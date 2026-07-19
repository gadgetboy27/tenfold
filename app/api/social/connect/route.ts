import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import {
  createAyrshareProfile,
  generateSocialConnectUrl,
} from "@/lib/ayrshare/profiles";

export async function GET(req: Request) {
  try {
    const session = await getSession(req);

    // Ayrshare (every network beyond Facebook/Instagram) is Pro-only. Gate the
    // connect here so free users get a clear upgrade prompt instead of linking
    // an account they can never publish to. 402 = upgrade required.
    const ent = await getEntitlements(session.workspaceId);
    if (!ent.isPro) {
      return NextResponse.json(
        {
          error:
            "Connecting X, LinkedIn, TikTok, YouTube & more is a Pro feature. Facebook & Instagram are free.",
          upgradeRequired: true,
        },
        { status: 402 },
      );
    }

    const admin = createSupabaseAdminClient();

    const { data: workspace } = await admin
      .from("workspaces")
      .select("id, name, brand_name, ayrshare_profile_key")
      .eq("id", session.workspaceId)
      .single();

    if (!workspace)
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 },
      );

    const ws = workspace as {
      id: string;
      name: string;
      brand_name: string | null;
      ayrshare_profile_key: string | null;
    };
    let profileKey = ws.ayrshare_profile_key;

    if (!profileKey) {
      // Title the Ayrshare profile with the business/brand name when set, so it
      // reads as the customer's brand rather than a personal workspace name.
      const profile = await createAyrshareProfile(
        ws.brand_name?.trim() || ws.name,
      );
      profileKey = profile.profileKey;
      await admin
        .from("workspaces")
        .update({ ayrshare_profile_key: profileKey })
        .eq("id", session.workspaceId);
    }

    // Bounce the user back into Tenfold after they finish linking, instead of
    // leaving them stranded on Ayrshare's hosted page. Prefer the configured
    // app URL, fall back to the request origin; land on the social settings
    // page, which re-fetches profiles on mount and reflects what they linked.
    const slug = req.headers.get("x-workspace-slug");
    const origin = process.env.APP_URL ?? new URL(req.url).origin;
    const redirect = slug ? `${origin}/${slug}/settings/social` : undefined;

    const connectUrl = await generateSocialConnectUrl(profileKey, redirect);
    return NextResponse.json({ connectUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
