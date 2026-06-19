import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { v4 as uuidv4 } from "uuid";

// POST /api/uploads/image — generic authenticated image upload to the public
// `assets` bucket. Returns a public URL for use as a fal model input (e.g. the
// virtual try-on model + garment photos). Each upload is unique.
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    if (!["png", "jpg", "jpeg", "webp"].includes(ext)) {
      return NextResponse.json(
        { error: "Image must be PNG, JPG, or WEBP" },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image must be under 10 MB" },
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
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
