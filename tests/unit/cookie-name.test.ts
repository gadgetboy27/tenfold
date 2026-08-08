import { describe, it, expect } from "vitest";
import {
  AUTH_COOKIE_NAME,
  staleAuthCookieNames,
} from "@/lib/supabase/cookie-name";

const c = (...names: string[]) => names.map((name) => ({ name }));

describe("staleAuthCookieNames", () => {
  // The incident: NEXT_PUBLIC_SUPABASE_URL moved to a custom domain, the
  // derived cookie name changed, and the old cookies were orphaned rather than
  // replaced. They kept being sent, each login added more, and the Cookie
  // header eventually exceeded Node's 16KB limit — HTTP 431 on every
  // authenticated fetch.
  it("finds cookies left over from a previous URL derivation", () => {
    expect(
      staleAuthCookieNames(
        c(
          "sb-gbccfqpmoteicpumhkuj-auth-token",
          "sb-auth-auth-token",
          AUTH_COOKIE_NAME,
        ),
      ),
    ).toEqual(["sb-gbccfqpmoteicpumhkuj-auth-token", "sb-auth-auth-token"]);
  });

  it("catches chunked cookies, which are what actually blow the header", () => {
    // A session JWT is split across .0/.1/.2 — the chunks are the bulk of it.
    expect(
      staleAuthCookieNames(
        c(
          "sb-gbccfqpmoteicpumhkuj-auth-token.0",
          "sb-gbccfqpmoteicpumhkuj-auth-token.1",
          "sb-gbccfqpmoteicpumhkuj-auth-token.2",
        ),
      ),
    ).toHaveLength(3);
  });

  it("keeps the current cookie and its own chunks", () => {
    expect(
      staleAuthCookieNames(
        c(AUTH_COOKIE_NAME, `${AUTH_COOKIE_NAME}.0`, `${AUTH_COOKIE_NAME}.1`),
      ),
    ).toEqual([]);
  });

  it("ignores cookies that aren't Supabase auth cookies", () => {
    expect(
      staleAuthCookieNames(c("theme", "sb-provider-token", "_ga", "session")),
    ).toEqual([]);
  });

  it("is a no-op on a clean jar", () => {
    expect(staleAuthCookieNames([])).toEqual([]);
  });
});
