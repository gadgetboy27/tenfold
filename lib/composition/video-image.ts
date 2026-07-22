import { randomUUID } from "crypto";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Kling (and most fal image-to-video models) reject a start image over 10 MB
// with `file_too_large`. FLUX Ultra anchors are routinely 10–15 MB, so the
// video would 422 intermittently depending on the anchor. Normalize the start
// frame to a safe JPEG first: cap the longest edge and step quality down until
// it's comfortably under the limit. A video start frame never needs more than
// ~2K pixels, so this is lossless in practice.
const VIDEO_IMAGE_MAX_BYTES = 9_000_000; // headroom under fal's 10 MB cap
const VIDEO_IMAGE_MAX_EDGE = 2048;

/**
 * Return a URL for `sourceUrl` that's safe to hand a fal image-to-video model.
 * If the source is already small enough, it's returned unchanged (no re-upload).
 * On any failure the original URL is returned — better to let fal surface the
 * real error than to fail the job here.
 */
export async function prepareVideoStartImage(
  sourceUrl: string,
  workspaceId: string,
): Promise<string> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return sourceUrl;
    const buffer = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buffer)
      .metadata()
      .catch(() => null);
    const longest = Math.max(meta?.width ?? 0, meta?.height ?? 0);
    if (
      buffer.byteLength <= VIDEO_IMAGE_MAX_BYTES &&
      longest <= VIDEO_IMAGE_MAX_EDGE
    ) {
      return sourceUrl; // already safe
    }

    const encode = (quality: number) =>
      sharp(buffer)
        .rotate() // respect EXIF orientation before we drop the metadata
        .resize(VIDEO_IMAGE_MAX_EDGE, VIDEO_IMAGE_MAX_EDGE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality })
        .toBuffer();

    let quality = 88;
    let out = await encode(quality);
    while (out.byteLength > VIDEO_IMAGE_MAX_BYTES && quality > 50) {
      quality -= 12;
      out = await encode(quality);
    }

    const supabase = createSupabaseAdminClient();
    const path = `${workspaceId}/video-src/${randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("assets")
      .upload(path, out, { contentType: "image/jpeg", upsert: true });
    if (error) return sourceUrl;
    return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
  } catch {
    return sourceUrl;
  }
}
