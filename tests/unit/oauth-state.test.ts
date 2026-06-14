import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { signOAuthState, verifyOAuthState } from '@/lib/social/oauth-state';

const SECRET = 'test-meta-app-secret';
const WORKSPACE = '11111111-1111-1111-1111-111111111111';

beforeAll(() => {
  process.env.META_APP_SECRET = SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OAuth signed state', () => {
  it('round-trips a workspaceId', () => {
    const state = signOAuthState(WORKSPACE);
    expect(verifyOAuthState(state)).toBe(WORKSPACE);
  });

  it('rejects a tampered workspaceId (signature no longer matches)', () => {
    const state = signOAuthState(WORKSPACE);
    const [, issuedAt, sig] = state.split('.');
    const forged = `22222222-2222-2222-2222-222222222222.${issuedAt}.${sig}`;
    expect(verifyOAuthState(forged)).toBeNull();
  });

  it('rejects a state signed with a different secret', () => {
    const payload = `${WORKSPACE}.${Date.now()}`;
    const wrongSig = createHmac('sha256', 'attacker-secret')
      .update(payload)
      .digest('base64url');
    expect(verifyOAuthState(`${payload}.${wrongSig}`)).toBeNull();
  });

  it('rejects malformed / empty / null states', () => {
    expect(verifyOAuthState(null)).toBeNull();
    expect(verifyOAuthState('')).toBeNull();
    expect(verifyOAuthState('not-a-valid-state')).toBeNull();
    expect(verifyOAuthState(`${WORKSPACE}.123`)).toBeNull();
  });

  it('rejects an expired state (older than the TTL)', () => {
    const state = signOAuthState(WORKSPACE);
    // Jump 11 minutes ahead — past the 10-minute TTL
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(verifyOAuthState(state)).toBeNull();
  });
});
