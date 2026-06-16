import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RedeemResult =
  | { success: true; balance: number; credits: number }
  | { success: false; reason: string };

/**
 * Redeem a promo / friends-and-family code for a workspace. All validation and
 * the credit grant happen atomically inside the `redeem_promo_code` Postgres
 * function (same RPC pattern as debit_credits), so there's no double-grant race.
 */
export async function redeemPromoCode(
  workspaceId: string,
  code: string,
): Promise<RedeemResult> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc("redeem_promo_code", {
    p_workspace_id: workspaceId,
    p_code: code,
  });

  if (error) {
    console.error("redeem_promo_code RPC error:", error);
    return { success: false, reason: "error" };
  }

  // PostgREST array-wraps a function's jsonb result; unwrap before reading.
  const row = Array.isArray(data) ? data[0] : data;
  const result = row as {
    success: boolean;
    balance?: number;
    credits?: number;
    reason?: string;
  };

  if (!result.success) return { success: false, reason: result.reason ?? "invalid" };
  return { success: true, balance: result.balance ?? 0, credits: result.credits ?? 0 };
}
