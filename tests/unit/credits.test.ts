import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CREDIT_COSTS } from '@/lib/credits/costs';

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({
      data: { success: false, balance: 0 },
      error: null,
    }),
  })),
}));

describe('CREDIT_COSTS', () => {
  it('has positive values for all job types', () => {
    for (const [key, value] of Object.entries(CREDIT_COSTS)) {
      expect(value, `${key} must be > 0`).toBeGreaterThan(0);
    }
  });

  it('image_generation costs 12 credits (for 4 images)', () => {
    expect(CREDIT_COSTS.image_generation).toBe(12);
  });

  it('script_generation is the cheapest at 1 credit', () => {
    const min = Math.min(...Object.values(CREDIT_COSTS));
    expect(CREDIT_COSTS.script_generation).toBe(min);
  });
});

describe('debitCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success: false when balance is insufficient', async () => {
    const { debitCredits } = await import('@/lib/credits/debit');

    const result = await debitCredits('ws-1', 'job-1', 'image_generation');
    expect(result.success).toBe(false);
  });
});
