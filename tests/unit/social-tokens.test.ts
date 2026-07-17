import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The refresh path is the difference between a connection that keeps working
 * and one that dies quietly. Reddit's access token lasts an hour and TikTok's
 * a day, so every branch here is a real production case, not a hypothetical.
 */

const updates: Record<string, unknown>[] = [];
let updateError: { message: string } | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        return {
          eq: () => ({ eq: () => Promise.resolve({ error: updateError }) }),
        };
      },
    }),
  }),
}));

const refresh = vi.fn();
let rotates = false;
let hasRefresh = true;

vi.mock("@/lib/social/providers", () => ({
  getProvider: (id: string) =>
    id === "ghost"
      ? null
      : {
          id,
          label: id,
          scopes: [],
          authUrl: () => "",
          exchangeCode: async () => ({ accessToken: "" }),
          ...(hasRefresh ? { refresh } : {}),
          rotatesRefreshToken: rotates,
        },
}));

const { getFreshAccessToken, ReconnectRequiredError } =
  await import("@/lib/social/tokens");

const profile = (
  over: Partial<Parameters<typeof getFreshAccessToken>[0]> = {},
) => ({
  workspace_id: "ws-1",
  platform: "reddit",
  access_token: "old-token",
  refresh_token: "refresh-1",
  token_expires_at: new Date(Date.now() - 1000).toISOString(), // expired
  ...over,
});

beforeEach(() => {
  updates.length = 0;
  updateError = null;
  rotates = false;
  hasRefresh = true;
  refresh.mockReset();
  refresh.mockResolvedValue({
    accessToken: "new-token",
    refreshToken: "refresh-2",
    expiresInSec: 3600,
  });
});

describe("getFreshAccessToken", () => {
  it("uses a non-expiring token as-is", async () => {
    // Meta Page tokens have no expiry — that is why FB/IG survived with no
    // refresh code at all, and it must keep costing zero calls.
    const t = await getFreshAccessToken(
      profile({ platform: "facebook", token_expires_at: null }),
    );
    expect(t).toBe("old-token");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("uses a token that is still comfortably alive", async () => {
    const t = await getFreshAccessToken(
      profile({
        token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    expect(t).toBe("old-token");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes BEFORE expiry, not after", async () => {
    // A token with 60s left would die mid-request. The skew is the whole point.
    const t = await getFreshAccessToken(
      profile({
        token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    );
    expect(t).toBe("new-token");
  });

  it("refreshes an expired token and persists the result", async () => {
    const t = await getFreshAccessToken(profile());
    expect(t).toBe("new-token");
    expect(updates[0]).toMatchObject({
      access_token: "new-token",
      refresh_token: "refresh-2",
    });
    expect(updates[0].token_expires_at).toBeTruthy();
  });

  it("keeps the existing refresh token when none is returned", async () => {
    // Overwriting with null would break every future refresh — the connection
    // would work once and then be unrecoverable.
    refresh.mockResolvedValue({ accessToken: "new-token", expiresInSec: 3600 });
    await getFreshAccessToken(profile());
    expect(updates[0].refresh_token).toBe("refresh-1");
  });

  it("collapses concurrent refreshes into one call", async () => {
    // TikTok invalidates the old refresh token when it issues a new one, so two
    // simultaneous refreshes would leave the loser holding a dead token.
    const p = profile();
    const [a, b, c] = await Promise.all([
      getFreshAccessToken(p),
      getFreshAccessToken(p),
      getFreshAccessToken(p),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual(["new-token", "new-token", "new-token"]);
  });

  it("asks for a reconnect when there is no refresh token", async () => {
    await expect(
      getFreshAccessToken(profile({ refresh_token: null })),
    ).rejects.toBeInstanceOf(ReconnectRequiredError);
  });

  it("asks for a reconnect when the provider cannot refresh", async () => {
    hasRefresh = false;
    await expect(getFreshAccessToken(profile())).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
  });

  it("asks for a reconnect when the provider rejects the refresh token", async () => {
    // Revoked access, or a rotation we lost. Either way only the user can fix it.
    refresh.mockRejectedValue(new Error("invalid_grant"));
    await expect(getFreshAccessToken(profile())).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
  });

  it("fails loudly if a rotated token cannot be stored", async () => {
    // The provider has already killed the old refresh token, so a silent write
    // failure would strand the connection and surface later as a mystery.
    rotates = true;
    updateError = { message: "db down" };
    await expect(getFreshAccessToken(profile())).rejects.toBeInstanceOf(
      ReconnectRequiredError,
    );
  });

  it("still returns a token if a NON-rotating write fails", async () => {
    // Reddit's refresh token is reusable, so a failed write costs an extra
    // refresh next time — not a broken connection. Don't fail the publish.
    rotates = false;
    updateError = { message: "db down" };
    await expect(getFreshAccessToken(profile())).resolves.toBe("new-token");
  });

  it("asks for a reconnect when there is no token at all", async () => {
    await expect(
      getFreshAccessToken(profile({ access_token: null })),
    ).rejects.toBeInstanceOf(ReconnectRequiredError);
  });
});
