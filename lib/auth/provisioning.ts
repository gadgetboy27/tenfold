import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Single source of truth for first-login workspace provisioning.
 *
 * Previously this logic was copy-pasted into login/actions.ts,
 * (auth)/callback/route.ts and api/workspaces/provision/route.ts — three
 * subtly different implementations of "create workspace + member + credit
 * account + welcome grant + cache slug". Centralising it here keeps the auth
 * flow consistent and makes the welcome-credit ledger entry identical across
 * every entry point.
 */

export const WELCOME_CREDITS = 50;

export interface ProvisionUser {
  id: string;
  email?: string | null;
  fullName?: string | null;
}

export interface ProvisionResult {
  workspaceId: string;
  slug: string;
  alreadyProvisioned: boolean;
}

function buildSlug(baseName: string, workspaceId: string): string {
  const base = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 35);
  return `${base || "workspace"}-${workspaceId.slice(0, 6)}`;
}

/**
 * Returns the user's workspace, creating it (and granting welcome credits) on
 * first login. Idempotent: a user who already has a membership is returned
 * unchanged, and their `workspace_slug` metadata is refreshed.
 */
export async function getOrProvisionWorkspace(
  user: ProvisionUser,
): Promise<ProvisionResult> {
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(id, slug)")
    .eq("user_id", user.id)
    .limit(1);

  if (existing?.length) {
    const row = existing[0] as unknown as {
      workspace_id: string;
      workspaces: { id: string; slug: string } | { id: string; slug: string }[];
    };
    const ws = Array.isArray(row.workspaces)
      ? row.workspaces[0]
      : row.workspaces;
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { workspace_slug: ws?.slug },
    });
    return {
      workspaceId: row.workspace_id,
      slug: ws?.slug ?? "",
      alreadyProvisioned: true,
    };
  }

  const workspaceId = crypto.randomUUID();
  const baseName = user.fullName ?? user.email?.split("@")[0] ?? "My Workspace";
  const slug = buildSlug(baseName, workspaceId);

  const { error: wsErr } = await admin
    .from("workspaces")
    .insert({ id: workspaceId, name: baseName, slug, owner_id: user.id });
  if (wsErr) throw new Error(`workspace: ${wsErr.message}`);

  const { error: memErr } = await admin
    .from("workspace_members")
    .insert({ workspace_id: workspaceId, user_id: user.id, role: "owner" });
  // 23505 = unique violation: user is already a member (race / retry) — tolerate
  if (memErr && memErr.code !== "23505")
    throw new Error(`member: ${memErr.message}`);

  const { error: acctErr } = await admin
    .from("credit_accounts")
    .insert({ workspace_id: workspaceId, cached_balance: WELCOME_CREDITS });
  if (acctErr && acctErr.code !== "23505")
    throw new Error(`credits: ${acctErr.message}`);

  const { error: txErr } = await admin.from("credit_transactions").insert({
    workspace_id: workspaceId,
    type: "grant",
    amount: WELCOME_CREDITS,
    balance_after: WELCOME_CREDITS,
    description: `Welcome credits for ${user.id}`,
  });
  if (txErr) throw new Error(`tx: ${txErr.message}`);

  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { workspace_slug: slug },
  });

  return { workspaceId, slug, alreadyProvisioned: false };
}
