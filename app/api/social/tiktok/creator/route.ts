import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { decryptProfileTokens } from "@/lib/social/token-crypto";
import { freshAccessToken, type DirectProfile } from "@/lib/social/direct";
import { getTikTokCreatorInfo } from "@/lib/social/direct/tiktok";

// GET /api/social/tiktok/creator — what the connected TikTok account may do
// right now: its nickname, the privacy levels it is allowed, its maximum video
// length and its own comment/duet/stitch settings. TikTok requires the posting
// screen to be built from exactly this, not from assumptions, so the Publish
// panel asks before it shows any TikTok controls.
export const GET = withWorkspace(async (_req, { db, session }) => {
  const { data } = await db
    .from("social_profiles")
    .select("*")
    .eq("platform", "tiktok")
    .maybeSingle();
  if (!data) {
    return NextResponse.json(
      { error: "TikTok isn't connected — connect it in Settings → Social." },
      { status: 404 },
    );
  }

  const profile = decryptProfileTokens(data as DirectProfile);
  let token: string;
  try {
    token = await freshAccessToken("tiktok", profile, session.workspaceId);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "TikTok needs reconnecting — Settings → Social.",
      },
      { status: 401 },
    );
  }

  const info = await getTikTokCreatorInfo(token);
  if (!info) {
    return NextResponse.json(
      { error: "TikTok didn't return this account's settings — try again." },
      { status: 502 },
    );
  }
  return NextResponse.json(info);
});
