import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { v4 as uuidv4 } from "uuid";
import { VIDEO_TYPES } from "@/lib/uploads/content";

// POST /api/uploads/video — authenticated video upload to the public assets
// bucket (mirrors uploads/image). Used by the compositor to persist local
// background footage before a server-side export can fetch it.
export const POST = withWorkspace(async (req, { admin, session }) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
  if (!["mp4", "webm", "mov", "m4v"].includes(ext)) {
    return NextResponse.json(
      { error: "Video must be MP4, WEBM, MOV, or M4V" },
      { status: 400 },
    );
  }
  if (file.size > 200 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Video must be under 200 MB" },
      { status: 400 },
    );
  }

  const storagePath = `uploads/${session.workspaceId}/${uuidv4()}.${ext}`;
  const buffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("assets")
    // Type from the validated extension, never from file.type (client-chosen).
    .upload(storagePath, buffer, { contentType: VIDEO_TYPES[ext] });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: urlData } = admin.storage
    .from("assets")
    .getPublicUrl(storagePath);
  return NextResponse.json({ url: urlData.publicUrl });
});
