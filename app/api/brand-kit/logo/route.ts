import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveOwnedAsset } from "@/lib/assets/owned";

const ALLOWED_EXT = ["png", "jpg", "jpeg", "webp", "svg"];

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    // Either a file upload (multipart) or JSON naming an asset this workspace
    // already owns — a mark made in Logo Studio shouldn't have to be
    // downloaded and re-uploaded to become the brand kit's logo. Either way
    // the bytes are copied to the brand-kit's own fixed path, so the kit keeps
    // working if the source asset is later deleted.
    const isJson = (req.headers.get("content-type") ?? "").includes(
      "application/json",
    );

    let buffer: ArrayBuffer;
    let ext: string;
    let contentType: string;
    let variant: "light" | "dark";

    if (isJson) {
      const body = (await req.json()) as {
        assetId?: unknown;
        variant?: unknown;
      };
      variant = body.variant === "dark" ? "dark" : "light";
      if (typeof body.assetId !== "string" || !body.assetId) {
        return NextResponse.json(
          { error: "No asset provided" },
          { status: 400 },
        );
      }
      const owned = await resolveOwnedAsset(
        admin,
        session.workspaceId,
        body.assetId,
      );
      if (!owned) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const srcRes = await fetch(owned.url);
      if (!srcRes.ok) {
        return NextResponse.json(
          { error: "Couldn't read that image" },
          { status: 502 },
        );
      }
      contentType = srcRes.headers.get("content-type") ?? "image/png";
      ext = contentType.includes("svg")
        ? "svg"
        : contentType.includes("webp")
          ? "webp"
          : contentType.includes("png")
            ? "png"
            : "jpg";
      buffer = await srcRes.arrayBuffer();
      if (buffer.byteLength > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Image must be under 5 MB" },
          { status: 400 },
        );
      }
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      // "light" (default) = the primary mark, used on dark footage;
      // "dark" = the variant for light backgrounds.
      variant = formData.get("variant") === "dark" ? "dark" : "light";

      if (!file)
        return NextResponse.json(
          { error: "No file provided" },
          { status: 400 },
        );

      ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      if (!ALLOWED_EXT.includes(ext)) {
        return NextResponse.json(
          { error: "File must be PNG, JPG, WEBP, or SVG" },
          { status: 400 },
        );
      }
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "File must be under 5 MB" },
          { status: 400 },
        );
      }
      contentType = file.type;
      buffer = await file.arrayBuffer();
    }

    const name = variant === "dark" ? "logo-dark" : "logo";
    const storagePath = `brand-kits/${session.workspaceId}/${name}.${ext}`;

    await admin.storage.from("assets").upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

    const { data: urlData } = admin.storage
      .from("assets")
      .getPublicUrl(storagePath);

    const columns =
      variant === "dark"
        ? {
            logo_dark_url: urlData.publicUrl,
            logo_dark_storage_path: storagePath,
          }
        : { logo_url: urlData.publicUrl, logo_storage_path: storagePath };
    await admin.from("brand_kits").upsert(
      {
        workspace_id: session.workspaceId,
        ...columns,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" },
    );

    return NextResponse.json({ url: urlData.publicUrl, variant });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
