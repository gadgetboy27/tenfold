import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * refund_credits(uuid, uuid, integer, text) needs four arguments. refundCredits
 * used to send only p_job_id, so PostgREST matched no function and EVERY refund
 * in the app silently failed — three months of production had exactly one
 * refund row, and that one was inserted by hand. These tests pin the argument
 * shape and the two guards that stop a refund from minting credits.
 */

const rpc = vi.fn();
const maybeSingle = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle }),
        }),
      }),
    }),
  }),
}));

describe('refundCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: [{ success: true, balance: 100 }], error: null });
  });

  it('passes all four RPC arguments, resolved from the job spend row', async () => {
    maybeSingle.mockResolvedValue({
      data: { workspace_id: 'ws-1', amount: -32, description: 'logo_concepts job' },
      error: null,
    });
    const { refundCredits } = await import('@/lib/credits/refund');

    const result = await refundCredits('job-1');

    expect(result).toEqual({ success: true, newBalance: 100 });
    expect(rpc).toHaveBeenCalledWith('refund_credits', {
      p_workspace_id: 'ws-1',
      p_job_id: 'job-1',
      // Spends are stored negative; the RPC ADDS p_cost to the balance, so a
      // negative here would debit the user a second time for failing.
      p_cost: 32,
      p_description: expect.stringContaining('logo_concepts job'),
    });
  });

  it('refuses to refund a job that was never charged', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { refundCredits } = await import('@/lib/credits/refund');

    const result = await refundCredits('never-charged');

    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports failure rather than success when the lookup errors', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { refundCredits } = await import('@/lib/credits/refund');

    const result = await refundCredits('job-1');

    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('unwraps the array-wrapped PostgREST row', async () => {
    maybeSingle.mockResolvedValue({
      data: { workspace_id: 'ws-1', amount: -5, description: 'x' },
      error: null,
    });
    rpc.mockResolvedValue({ data: [{ success: true, balance: 42 }], error: null });
    const { refundCredits } = await import('@/lib/credits/refund');

    expect(await refundCredits('job-1')).toEqual({ success: true, newBalance: 42 });
  });
});
