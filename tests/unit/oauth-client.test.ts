import { describe, it, expect, vi, beforeEach } from "vitest";

const signInWithOAuth = vi.fn(
  async (_opts: { provider: string; options: { redirectTo: string } }) => ({
    error: null as { message: string } | null,
  }),
);
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({ auth: { signInWithOAuth } })),
}));

import { signInWithOAuthProvider } from "@/lib/auth/oauth-client";

describe("signInWithOAuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  });

  it("starts LinkedIn sign-in with provider linkedin_oidc and the /auth/callback redirect", async () => {
    const res = await signInWithOAuthProvider("linkedin_oidc");
    expect(res.error).toBeUndefined();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "linkedin_oidc",
      options: { redirectTo: "https://app.test/auth/callback" },
    });
  });

  it.each(["google", "facebook", "linkedin_oidc"] as const)(
    "routes %s through the /auth/callback handler",
    async (provider) => {
      await signInWithOAuthProvider(provider);
      const arg = signInWithOAuth.mock.calls[0][0] as {
        provider: string;
        options: { redirectTo: string };
      };
      expect(arg.provider).toBe(provider);
      expect(arg.options.redirectTo.endsWith("/auth/callback")).toBe(true);
    },
  );

  it("returns an error instead of throwing when auth env is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await signInWithOAuthProvider("google");
    expect(res.error).toBeTruthy();
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
});
