import { describe, it, expect } from "vitest";

/**
 * Reported as "choosing a logo takes far too long — 5 to 10 minutes".
 *
 * It wasn't slow. Measured on the real job: **21 seconds of work, still
 * showing "Generating… 0 of 6 ready" eight minutes later.** Logo concepts run
 * as six PARALLEL fal requests, so wall time is the slowest of six — the
 * median across every run in the workspace is 20.5s.
 *
 * The cause was classification, not speed. `GET /api/logo/[id]` sorted assets
 * into concepts/refined/finalized purely by `metadata.logo_stage`, and an
 * IMPORTED logo is tagged `logo_vectorize` — which matched none of them. So
 * `finalized` came back empty, the client's `displayAnchor` (anchor ?? final)
 * was null, and the render fell through to the concepts grid for a project
 * that had already finished. After five minutes the stall notice then claimed
 * spent credits with no refund, for a job that had succeeded.
 *
 * The rule that came out of it: **`final_asset_id` is the project's own answer;
 * the stage tag only describes how an asset was made.** Classify by the
 * authoritative field first.
 */

interface Asset {
  id: string;
  metadata: { logo_stage?: string } | null;
}

/** Mirrors the route's filter. */
function finalized(rows: Asset[], finalAssetId: string | null): Asset[] {
  return rows.filter(
    (a) =>
      a.id === finalAssetId ||
      a.metadata?.logo_stage === "logo_finalize" ||
      a.metadata?.logo_stage === "logo_vectorize",
  );
}

const vectorized: Asset = {
  id: "asset-imported",
  metadata: { logo_stage: "logo_vectorize" },
};
const generated: Asset = {
  id: "asset-final",
  metadata: { logo_stage: "logo_finalize" },
};
const concept: Asset = {
  id: "asset-concept",
  metadata: { logo_stage: "logo_concepts" },
};

describe("an imported logo counts as finished", () => {
  it("is returned as finalized — the bug that showed 'Generating… 0 of 6'", () => {
    expect(finalized([vectorized], "asset-imported")).toHaveLength(1);
  });

  it("is found even when the stage tag is one nobody anticipated", () => {
    // The real guarantee: whatever the project POINTS AT is the finished mark,
    // however it was produced. A future stage tag can't strand a project again.
    const odd: Asset = { id: "asset-x", metadata: { logo_stage: "logo_wat" } };
    expect(finalized([odd], "asset-x")).toHaveLength(1);
  });

  it("is found even with no metadata at all", () => {
    const bare: Asset = { id: "asset-y", metadata: null };
    expect(finalized([bare], "asset-y")).toHaveLength(1);
  });
});

describe("the other stages are unchanged", () => {
  it("still returns a generated finalize", () => {
    expect(finalized([generated], null).map((a) => a.id)).toEqual([
      "asset-final",
    ]);
  });

  it("does not promote a concept to finished", () => {
    // A concept is what you pick FROM; calling it final would skip the choice.
    expect(finalized([concept], null)).toHaveLength(0);
  });

  it("lists earlier finalize runs alongside the current pick", () => {
    const rows = [concept, generated, vectorized];
    expect(
      finalized(rows, "asset-imported")
        .map((a) => a.id)
        .sort(),
    ).toEqual(["asset-final", "asset-imported"]);
  });

  it("never lists the same asset twice when both rules match", () => {
    // final_asset_id AND the stage tag both match here — a filter, not a
    // concat, so it stays one row. Two copies would render a duplicate tile.
    expect(finalized([generated], "asset-final")).toHaveLength(1);
  });
});
