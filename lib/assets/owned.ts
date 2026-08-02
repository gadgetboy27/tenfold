import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve an asset id to its public URL, but ONLY if it belongs to this
 * workspace.
 *
 * The gallery pickers let a user reuse an existing asset instead of uploading a
 * file, which means the client now names an asset rather than sending bytes.
 * Never trust a URL from the client for that — it would let anyone point a fal
 * job (or a brand-kit copy) at an arbitrary address, and at another tenant's
 * storage. Passing an id and looking the URL up under the session's
 * `workspace_id` keeps the tenant boundary where it already is.
 */
export async function resolveOwnedAsset(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workspaceId: string,
  assetId: string,
): Promise<{ url: string; storagePath: string | null } | null> {
  const { data } = await admin
    .from("assets")
    .select("url, storage_path")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const row = data as { url: string; storage_path: string | null } | null;
  return row ? { url: row.url, storagePath: row.storage_path } : null;
}
