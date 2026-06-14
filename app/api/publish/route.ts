import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publishSchema } from "@/lib/validation/schemas";
import {
  publishPhotoToFacebook,
  publishVideoToFacebook,
  publishPhotoToInstagram,
  publishVideoToInstagram,
} from "@/lib/social/meta";
import { v4 as uuidv4 } from "uuid";

interface SocialProfile {
  platform: string;
  platform_page_id: string | null;
  platform_account_id: string | null;
  access_token: string;
}

interface Asset {
  id: string;
  url: string;
  type: string;
}

async function publishToFacebook(
  profile: SocialProfile,
  asset: Asset,
  caption: string,
): Promise<string> {
  if (!profile.platform_page_id) throw new Error("Facebook Page ID not found");
  if (asset.type === "video") {
    return publishVideoToFacebook(
      profile.platform_page_id,
      profile.access_token,
      asset.url,
      caption,
    );
  }
  return publishPhotoToFacebook(
    profile.platform_page_id,
    profile.access_token,
    asset.url,
    caption,
  );
}

async function publishToInstagram(
  profile: SocialProfile,
  asset: Asset,
  caption: string,
): Promise<string> {
  const igUserId = profile.platform_account_id;
  if (!igUserId) throw new Error("Instagram account ID not found");
  if (asset.type === "video") {
    return publishVideoToInstagram(
      igUserId,
      profile.access_token,
      asset.url,
      caption,
    );
  }
  return publishPhotoToInstagram(
    igUserId,
    profile.access_token,
    asset.url,
    caption,
  );
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = publishSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    // Resolve asset — from composition, or direct assetId
    let asset: Asset | null = null;

    if (body.compositionId) {
      const { data: composition } = await admin
        .from("compositions")
        .select("output_asset_id, anchor_asset_id")
        .eq("id", body.compositionId)
        .eq("workspace_id", session.workspaceId)
        .single();
      if (!composition)
        return NextResponse.json(
          { error: "Composition not found" },
          { status: 404 },
        );
      const comp = composition as {
        output_asset_id: string | null;
        anchor_asset_id: string;
      };
      const { data: a } = await admin
        .from("assets")
        .select("id, url, type")
        .eq("id", comp.output_asset_id ?? comp.anchor_asset_id)
        .single();
      asset = a as Asset | null;
    } else if (body.assetId) {
      const { data: a } = await admin
        .from("assets")
        .select("id, url, type")
        .eq("id", body.assetId)
        .eq("workspace_id", session.workspaceId)
        .single();
      asset = a as Asset | null;
    }

    if (!asset)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    // Load connected profiles for requested platforms
    const { data: profiles } = await admin
      .from("social_profiles")
      .select("platform, platform_page_id, platform_account_id, access_token")
      .eq("workspace_id", session.workspaceId)
      .in("platform", body.platforms);

    if (!profiles || profiles.length === 0) {
      return NextResponse.json(
        {
          error:
            "No connected accounts for the selected platforms. Go to Settings → Social to connect.",
        },
        { status: 422 },
      );
    }

    const hashtags = body.hashtags.map((h) =>
      h.startsWith("#") ? h : `#${h}`,
    );
    const fullCaption = hashtags.length
      ? `${body.caption}\n\n${hashtags.join(" ")}`
      : body.caption;

    // Publish to each connected platform
    const platformResults: Record<string, string> = {};
    const errors: Record<string, string> = {};

    for (const profile of profiles as SocialProfile[]) {
      try {
        // Use the AI-tailored caption for this platform when provided (it already
        // carries platform-appropriate hashtags); otherwise the base + hashtags.
        const platformCaption =
          body.platformCaptions?.[profile.platform] ?? fullCaption;
        let postId: string;
        if (profile.platform === "facebook")
          postId = await publishToFacebook(profile, asset, platformCaption);
        else if (profile.platform === "instagram")
          postId = await publishToInstagram(profile, asset, platformCaption);
        else {
          errors[profile.platform] = "Platform publishing not yet supported";
          continue;
        }
        platformResults[profile.platform] = postId;
      } catch (err) {
        errors[profile.platform] =
          err instanceof Error ? err.message : "Unknown error";
      }
    }

    if (Object.keys(platformResults).length === 0) {
      return NextResponse.json(
        { error: "All platforms failed to publish", errors },
        { status: 500 },
      );
    }

    const isScheduled = !!body.scheduledAt;
    const { data: record } = await admin
      .from("publish_records")
      .insert({
        id: uuidv4(),
        composition_id: body.compositionId,
        workspace_id: session.workspaceId,
        platforms: body.platforms,
        caption: body.caption,
        hashtags: body.hashtags,
        scheduled_at: isScheduled ? body.scheduledAt : null,
        published_at: isScheduled ? null : new Date().toISOString(),
        status: isScheduled ? "scheduled" : "published",
        platform_results: platformResults as unknown as Record<string, unknown>,
      })
      .select()
      .single();

    if (body.compositionId) {
      await admin
        .from("compositions")
        .update({ status: "published" })
        .eq("id", body.compositionId);
    }

    return NextResponse.json(
      {
        record,
        platformResults,
        errors: Object.keys(errors).length ? errors : undefined,
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status =
      msg === "Unauthorized"
        ? 401
        : msg === "Not a workspace member"
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
