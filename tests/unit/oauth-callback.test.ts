import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────
const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const setSession = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { exchangeCodeForSession, verifyOtp, setSession },
  })),
}));

const getOrProvisionWorkspace = vi.fn();
vi.mock("@/lib/auth/provisioning", () => ({
  getOrProvisionWorkspace: (...args: unknown[]) =>
    getOrProvisionWorkspace(...args),
}));

// Rate limiter: allow by default; one test flips it off.
const checkRateLimit = vi.fn((..._args: unknown[]) => true);
vi.mock("@/lib/security/rate-limit", () => ({
  getRateLimitKey: () => "test-ip",
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

import { handleAuthCallback } from "@/lib/auth/oauth-callback";

const ORIGIN = "https://app.test";
const req = (qs: string) => new NextRequest(`${ORIGIN}/auth/callback${qs}`);

describe("handleAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockReturnValue(true);
    getOrProvisionWorkspace.mockResolvedValue({
      workspaceId: "w1",
      slug: "acme-9f3a2b",
      alreadyProvisioned: false,
    });
  });

  it("redirects to login with missing_code when no code/token present", async () => {
    const res = await handleAuthCallback(req(""));
    expect(res.headers.get("location")).toContain("/login?error=missing_code");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("429s when the rate limit is exceeded", async () => {
    checkRateLimit.mockReturnValue(false);
    const res = await handleAuthCallback(req("?code=abc"));
    expect(res.status).toBe(429);
  });

  it("exchanges an OAuth code, provisions, and redirects to the real workspace", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.com", user_metadata: {} } },
      error: null,
    });

    const res = await handleAuthCallback(req("?code=abc"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(getOrProvisionWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1", email: "a@b.com" }),
    );
    expect(res.headers.get("location")).toBe(`${ORIGIN}/acme-9f3a2b`);
  });

  it("redirects to login?error=auth_failed when code exchange errors", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: "bad code" },
    });
    const res = await handleAuthCallback(req("?code=bad"));
    expect(res.headers.get("location")).toContain("/login?error=auth_failed");
    expect(getOrProvisionWorkspace).not.toHaveBeenCalled();
  });

  it("verifies a magic-link OTP token and redirects to the workspace", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: "u2", email: "m@b.com", user_metadata: {} } },
      error: null,
    });

    const res = await handleAuthCallback(req("?token=tok&type=magiclink"));

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "tok",
      type: "magiclink",
    });
    expect(res.headers.get("location")).toBe(`${ORIGIN}/acme-9f3a2b`);
  });

  it("redirects to login?error=workspace_failed when provisioning throws", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "u3", email: "x@b.com", user_metadata: {} } },
      error: null,
    });
    getOrProvisionWorkspace.mockRejectedValue(new Error("db down"));

    const res = await handleAuthCallback(req("?code=abc"));
    expect(res.headers.get("location")).toContain(
      "/login?error=workspace_failed",
    );
  });
});
