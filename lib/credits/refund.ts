import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function refundCredits(jobId: string): Promise<{ success: boolean; newBalance?: number }> {
  const admin = createSupabaseAdminClient();

  // Use atomic RPC function to prevent duplicate refunds on webhook retries
  const { data, error } = await admin.rpc('refund_credits', {
    p_job_id: jobId,
  });

  if (error) {
    console.error('Credit refund RPC error:', error);
    return { success: false };
  }

  const result = data as { success: boolean; balance?: number; reason?: string };

  if (!result.success) {
    console.warn(`Credit refund skipped for job ${jobId}: ${result.reason}`);
  }

  return { success: result.success, newBalance: result.balance };
}
