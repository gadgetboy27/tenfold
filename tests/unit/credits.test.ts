import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CREDIT_COSTS } from '@/lib/credits/costs';

// Mock db for unit tests
const mockTx = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  for: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

vi.mock('@/db', () => ({
  db: {
    transaction: vi.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
    query: { creativeJobs: { findFirst: vi.fn() }, creditAccounts: { findFirst: vi.fn() } },
  },
}));

describe('CREDIT_COSTS', () => {
  it('has positive values for all job types', () => {
    for (const [key, value] of Object.entries(CREDIT_COSTS)) {
      expect(value, `${key} must be > 0`).toBeGreaterThan(0);
    }
  });

  it('image_generation costs 18 credits', () => {
    expect(CREDIT_COSTS.image_generation).toBe(18);
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
    const { db } = await import('@/db');
    const { debitCredits } = await import('@/lib/credits/debit');

    // tx.select chain returns an account with 0 balance
    mockTx.for.mockResolvedValueOnce([{ cachedBalance: 0, workspaceId: 'ws-1' }]);

    vi.mocked(db.transaction).mockImplementationOnce((fn) =>
      fn(mockTx as unknown as Parameters<typeof fn>[0]),
    );

    const result = await debitCredits('ws-1', 'job-1', 'image_generation');
    expect(result.success).toBe(false);
  });
});
