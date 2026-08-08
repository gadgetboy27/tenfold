import { describe, it, expect } from "vitest";
import {
  currentAuthCookieName,
  staleAuthCookieNames,
} from "@/lib/supabase/cookie-name";

const RAW = "https://gbccfqpmoteicpumhkuj.supabase.co";
const CUSTOM = "https://auth.prettymuch.nz";
const c = (...names: string[]) => names.map((name) => ({ name }));

describe("currentAuthCookieName", () => {
  // Verified empirically against @supabase/ssr 0.10.3 — if the library ever
  // changes its derivation, this test fails and the cleanup must follow suit,
  // rather than silently deleting live sessions.
  it("matches the library's derivation", () => {
    expect(currentAuthCookieName(RAW)).toBe(
      "sb-gbccfqpmoteicpumhkuj-auth-token",
    );
    expect(currentAuthCookieName(CUSTOM)).toBe("sb-auth-auth-token");
  });

  it("returns empty for a malformed URL rather than guessing", () => {
    expect(currentAuthCookieName("not a url")).toBe("");
  });
});

describe("staleAuthCookieNames", () => {
  it("finds cookies orphaned by a URL change", () => {
    expect(
      staleAuthCookieNames(
        c("sb-gbccfqpmoteicpumhkuj-auth-token", "sb-auth-auth-token"),
        CUSTOM,
      ),
    ).toEqual(["sb-gbccfqpmoteicpumhkuj-auth-token"]);
  });

  it("catches chunked cookies, which are the bulk of the header", () => {
    expect(
      staleAuthCookieNames(
        c(
          "sb-gbccfqpmoteicpumhkuj-auth-token.0",
          "sb-gbccfqpmoteicpumhkuj-auth-token.1",
          "sb-gbccfqpmoteicpumhkuj-auth-token.2",
        ),
        CUSTOM,
      ),
    ).toHaveLength(3);
  });

  // The regression that broke Google sign-in: the cleanup deleted the cookie
  // the middleware had just written, because the two disagreed about the
  // current name. Deleting the live session on every response is an infinite
  // login loop.
  it("NEVER deletes the cookie for the current URL", () => {
    expect(
      staleAuthCookieNames(
        c("sb-auth-auth-token", "sb-auth-auth-token.0"),
        CUSTOM,
      ),
    ).toEqual([]);
    expect(
      staleAuthCookieNames(c("sb-gbccfqpmoteicpumhkuj-auth-token"), RAW),
    ).toEqual([]);
  });

  it("leaves the PKCE code verifier alone", () => {
    // Deleting this mid-flow makes the OAuth code exchange fail — which is
    // exactly how the sign-in loop presented.
    expect(
      staleAuthCookieNames(c("sb-auth-auth-token-code-verifier"), CUSTOM),
    ).toEqual([]);
  });

  it("ignores non-Supabase cookies", () => {
    expect(
      staleAuthCookieNames(c("theme", "_ga", "sb-provider-token"), CUSTOM),
    ).toEqual([]);
  });

  it("deletes nothing when the URL is unusable", () => {
    expect(
      staleAuthCookieNames(c("sb-anything-auth-token"), "nonsense"),
    ).toEqual([]);
  });
});
