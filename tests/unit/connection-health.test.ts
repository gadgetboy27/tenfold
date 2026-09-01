import { describe, it, expect } from "vitest";
import {
  pageIsGranted,
  grantedPageIds,
  isUnhealthy,
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
