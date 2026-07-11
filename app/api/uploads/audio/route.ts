import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";

// POST /api/uploads/audio — authenticated audio upload to the public assets
// bucket (mirrors uploads/video). Lets a user bring their OWN music track for
// the compositor mix. The uploader must acknowledge they own or have licensed
// the audio (`acknowledged=true`) — a rights condition enforced here too, not
// just in the UI, since the published video bakes this audio in and social
// platforms fingerprint copyrighted music.
//
// When `campaignId` is supplied the track is also saved as a type:"audio" asset
// so it persists (auto-picked on reopen) and the publish mix can use it.
const AUDIO_EXTS = ["mp3", "wav", "m4a", "aac", "ogg"];

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const acknowledged = formData.get("acknowledged") === "true";
    const campaignId = (formData.get("campaignId") as string | null) || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!acknowledged) {
      return NextResponse.json(
        { error: "You must confirm you own or have licensed this audio." },
        { status: 400 },
      );
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp3";
    if (!AUDIO_EXTS.includes(ext)) {
      return NextResponse.json(
        { error: "Audio must be MP3, WAV, M4A, AAC, or OGG" },
        { status: 400 },
      );
    }
    if (file.size > 30 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio must be under 30 MB" },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const storagePath = `uploads/${session.workspaceId}/${uuidv4()}.${ext}`;
    const buffer = await file.arrayBuffer();
    const { error: upErr } = await admin.storage
      .from("assets")
      .upload(storagePath, buffer, { contentType: file.type });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: urlData } = admin.storage
      .from("assets")
      .getPublicUrl(storagePath);
    const url = urlData.publicUrl;

    // Persist as a campaign audio asset so it survives a reopen and the publish
    // mix picks it up (job_id is nullable — no originating creative job). Verify
    // the campaign belongs to this workspace first (tenant isolation).
    let assetId: string | null = null;
    if (campaignId) {
      const { data: campaign } = await admin
        .from("campaigns")
        .select("id")
        .eq("id", campaignId)
        .eq("workspace_id", session.workspaceId)
        .maybeSingle();
      if (!campaign) {
        // Not this workspace's campaign — return the usable URL, skip persistence.
        return NextResponse.json({ url, assetId: null });
      }
      assetId = uuidv4();
      const { error: assetErr } = await admin.from("assets").insert({
        id: assetId,
        campaign_id: campaignId,
        workspace_id: session.workspaceId,
        type: "audio",
        url,
        storage_path: storagePath,
        metadata: { source: "upload" },
      });
      if (assetErr) assetId = null; // best-effort: the URL still works for export
    }

    return NextResponse.json({ url, assetId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
