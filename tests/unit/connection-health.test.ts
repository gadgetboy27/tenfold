import { describe, it, expect, vi, afterEach } from "vitest";
import {
  pageIsGranted,
  grantedPageIds,
  isUnhealthy,
  checkMetaConnection,
} from "@/lib/social/health";

/**
 * Pinned against a real production failure, 2026-08-30.
 *
 * The Settings screen showed "Connected · LetsRoam" in green for seven weeks
 * while every publish failed. Meta's debug_token told the whole story the
 * moment anyone asked it:
 *
 *   is_valid = false
 *   granular_scopes:
 *     pages_manage_posts   -> 1233068756548099
 *     pages_read_engagement-> 1233068756548099
 *
 * ...while social_profiles stored page 1182524661618666. The permission was
 * real; it just wasn't for the Page we publish to. Meta grants per Page, so a
 * valid token proves nothing on its own.
 */

const GRANTED_PAGE = "1233068756548099";
const STORED_PAGE = "1182524661618666";

describe("pageIsGranted", () => {
  it("rejects the exact production case: grant covers a different Page", () => {
    const granular = [
      { scope: "pages_show_list", target_ids: [GRANTED_PAGE] },
      { scope: "pages_read_engagement", target_ids: [GRANTED_PAGE] },
      { scope: "pages_manage_posts", target_ids: [GRANTED_PAGE] },
    ];
    expect(pageIsGranted(granular, STORED_PAGE)).toBe(false);
    expect(pageIsGranted(granular, GRANTED_PAGE)).toBe(true);
  });

  it("treats a scope with no target_ids as unrestricted, not as denied", () => {
    // Meta omits target_ids rather than enumerating every Page. Reading that
    // as "no pages granted" would paint every healthy connection red, which is
    // the failure mode that trains people to ignore the warning.
    expect(pageIsGranted([{ scope: "pages_manage_posts" }], STORED_PAGE)).toBe(
      true,
    );
    expect(
      pageIsGranted(
        [{ scope: "pages_manage_posts", target_ids: [] }],
        STORED_PAGE,
      ),
    ).toBe(true);
  });

  it("says granted when Meta reports no granular scopes at all", () => {
    expect(pageIsGranted(undefined, STORED_PAGE)).toBe(true);
    expect(pageIsGranted([], STORED_PAGE)).toBe(true);
  });

  it("ignores pages_show_list, which governs discovery rather than posting", () => {
    // A grant that can post to our Page but lists a different one is healthy
    // for publishing; failing it here would be a false alarm.
    const granular = [
      { scope: "pages_show_list", target_ids: [GRANTED_PAGE] },
      { scope: "pages_manage_posts", target_ids: [STORED_PAGE] },
      { scope: "pages_read_engagement", target_ids: [STORED_PAGE] },
    ];
    expect(pageIsGranted(granular, STORED_PAGE)).toBe(true);
  });

  it("requires EVERY publish-critical scope to cover the Page", () => {
    // Posting needs both; covering one is not enough to publish.
    const granular = [
      { scope: "pages_manage_posts", target_ids: [STORED_PAGE] },
      { scope: "pages_read_engagement", target_ids: [GRANTED_PAGE] },
    ];
    expect(pageIsGranted(granular, STORED_PAGE)).toBe(false);
  });

  it("handles a multi-Page grant", () => {
    const granular = [
      { scope: "pages_manage_posts", target_ids: [GRANTED_PAGE, STORED_PAGE] },
      {
        scope: "pages_read_engagement",
        target_ids: [GRANTED_PAGE, STORED_PAGE],
      },
    ];
    expect(pageIsGranted(granular, STORED_PAGE)).toBe(true);
  });
});

describe("grantedPageIds", () => {
  it("de-duplicates across scopes and ignores non-publish scopes", () => {
    const granular = [
      { scope: "pages_show_list", target_ids: ["999"] },
      { scope: "pages_manage_posts", target_ids: [GRANTED_PAGE] },
      { scope: "pages_read_engagement", target_ids: [GRANTED_PAGE] },
    ];
    expect(grantedPageIds(granular)).toEqual([GRANTED_PAGE]);
  });

  it("returns empty rather than throwing when nothing is reported", () => {
    expect(grantedPageIds(undefined)).toEqual([]);
  });
});

/**
 * `isUnhealthy` gates four surfaces — the summary block, the collapsed card
 * header, the expanded card and the setup wizard. Every one of them used to
 * ask only "does a row exist?", which is how a dead grant kept a green tick
 * and a "You're ready to publish" line directly above a card that said "Needs
 * reconnecting".
 *
 * The asymmetry is the point: a real verdict must show, and everything else
 * must render exactly as it did before this check existed.
 */
describe("isUnhealthy", () => {
  it("flags the verdicts that actually stop a publish", () => {
    expect(isUnhealthy({ status: "token_invalid", message: "x" })).toBe(true);
    expect(isUnhealthy({ status: "page_not_granted", message: "x" })).toBe(
      true,
    );
  });

  it("never flags a connection the provider called fine", () => {
    expect(isUnhealthy({ status: "ok", message: null })).toBe(false);
  });

  it("treats a brand-new user's unknown state as fine, not broken", () => {
    // No connections yet, health payload empty, request still in flight — all
    // land here as `undefined`. Painting these red would greet every new
    // signup with an outage they don't have.
    expect(isUnhealthy(undefined)).toBe(false);
  });

  it("does not turn a missing app secret or a Graph blip into an outage", () => {
    // checkMetaConnection returns "unchecked" when META_APP_ID/SECRET are
    // absent or Graph is unreachable. Reporting that as broken is the failure
    // mode that teaches people to ignore the warning — worth more than the
    // warning itself.
    expect(isUnhealthy({ status: "unchecked", message: null })).toBe(false);
  });
});

/**
 * The fallback confirmation.
 *
 * debug_token is authoritative but needs META_APP_SECRET and a reachable
 * Graph. Without either, the old code returned "unchecked" — which the UI
 * renders exactly like healthy, so a deployment with no app secret showed a
 * confident green tick backed by nothing.
 *
 * The fallback reads the Page with the stored token: weaker, but real. What
 * these pin is that it stays labelled as weaker, and that its three outcomes
 * never collapse into each other.
 */
describe("checkMetaConnection fallback", () => {
  // Only our own keys, never a wholesale process.env reassignment — see the
  // note in token-crypto.test.ts. Vitest shares a process across suites.
  const PRIOR_ID = process.env.META_APP_ID;
  const PRIOR_SECRET = process.env.META_APP_SECRET;
  afterEach(() => {
    vi.unstubAllGlobals();
    if (PRIOR_ID === undefined) delete process.env.META_APP_ID;
    else process.env.META_APP_ID = PRIOR_ID;
    if (PRIOR_SECRET === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = PRIOR_SECRET;
  });

  it("falls back to a Page read when there is no app secret", async () => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: "LetsRoam" }),
      }),
    );
    const h = await checkMetaConnection("tok", "123");
    expect(h.status).toBe("ok");
    // Labelled as the weaker check, so the UI can qualify it. Reporting this
    // as debug_token would re-create the false confidence being fixed.
    expect(h.checkedVia).toBe("page_read");
    expect(h.confirmation).toContain("LetsRoam");
  });

  it("treats a Graph error on the fallback as a real refusal", async () => {
    delete process.env.META_APP_SECRET;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Invalid OAuth token" } }),
      }),
    );
    const h = await checkMetaConnection("tok", "123");
    expect(h.status).toBe("token_invalid");
    expect(h.checkedVia).toBe("page_read");
  });

  it("treats a network failure as unchecked, never as a refusal", async () => {
    delete process.env.META_APP_SECRET;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ETIMEDOUT")));
    const h = await checkMetaConnection("tok", "123");
    expect(h.status).toBe("unchecked");
    // Crying wolf on a blip is how a warning gets ignored.
    expect(isUnhealthy(h)).toBe(false);
  });

  it("cannot fall back with no Page id, and says unchecked rather than ok", async () => {
    delete process.env.META_APP_SECRET;
    const h = await checkMetaConnection("tok", null);
    expect(h.status).toBe("unchecked");
    expect(h.confirmation).toBeUndefined();
  });

  it("uses debug_token when it can, and says so", async () => {
    process.env.META_APP_ID = "id";
    process.env.META_APP_SECRET = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { is_valid: true, granular_scopes: [] } }),
      }),
    );
    const h = await checkMetaConnection("tok", "123");
    expect(h.status).toBe("ok");
    expect(h.checkedVia).toBe("debug_token");
    expect(h.confirmation).toBeTruthy();
  });

  it("falls back when debug_token itself is unreachable", async () => {
    process.env.META_APP_ID = "id";
    process.env.META_APP_SECRET = "secret";
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) throw new Error("ECONNRESET"); // debug_token
        return { ok: true, json: async () => ({ name: "LetsRoam" }) }; // page read
      }),
    );
    const h = await checkMetaConnection("tok", "123");
    expect(h.status).toBe("ok");
    expect(h.checkedVia).toBe("page_read");
  });

  it("stamps every verdict with when it ran", async () => {
    // A confirmation with no time on it can't be told from a stale one.
    delete process.env.META_APP_SECRET;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("x")));
    const h = await checkMetaConnection("tok", "123");
    expect(Number.isFinite(Date.parse(h.checkedAt ?? ""))).toBe(true);
  });
});
