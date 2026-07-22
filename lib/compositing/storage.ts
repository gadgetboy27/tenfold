import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Fetch a remote image into a Buffer for Sharp processing. */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export interface StoreCompositeOpts {
  workspaceId: string;
  campaignId: string;
  buffer: Buffer;
  /** Defaults to PNG so alpha (cutouts, gradient merges) is preserved. */
  contentType?: string;
  ext?: string;
  widthPx?: number;
  heightPx?: number;
  /** Written to metadata alongside kind='composite_step'. */
  metadata?: Record<string, unknown>;
  admin?: Admin;
}

export interface StoredComposite {
  assetId: string;
  url: string;
  storagePath: string;
}

/**
 * Upload a composited image to the public `assets` bucket and record it as an
 * asset tagged `kind: 'composite_step'` so the UI can step back through a
 * pipeline. Used by both the inline Sharp blends and the pipeline runner.
 */
export async function storeCompositeAsset(
  opts: StoreCompositeOpts,
): Promise<StoredComposite> {
  const admin = opts.admin ?? createSupabaseAdminClient();
  const assetId = randomUUID();
  const ext = opts.ext ?? "png";
  const storagePath = `${opts.workspaceId}/${opts.campaignId}/${assetId}.${ext}`;

  const { error: upErr } = await admin.storage
    .from("assets")
    .upload(storagePath, opts.buffer, {
      contentType: opts.contentType ?? "image/png",
      upsert: true,
    });
  if (upErr) throw new Error(`Composite upload failed: ${upErr.message}`);

  const { data } = admin.storage.from("assets").getPublicUrl(storagePath);

  const { error: insErr } = await admin.from("assets").insert({
    id: assetId,
    campaign_id: opts.campaignId,
    workspace_id: opts.workspaceId,
    type: "image",
    url: data.publicUrl,
    storage_path: storagePath,
    width_px: opts.widthPx ?? null,
    height_px: opts.heightPx ?? null,
    file_size_bytes: opts.buffer.byteLength,
    metadata: { kind: "composite_step", ...(opts.metadata ?? {}) },
  });
  if (insErr)
    throw new Error(`Composite asset insert failed: ${insErr.message}`);

  return { assetId, url: data.publicUrl, storagePath };
}
