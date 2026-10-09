import type { StartSeriesResult } from "./start";

/** The HTTP answer for a finished `startSeries` — kept out of the route so the
 *  route stays thin and these rules are testable. */
export function seriesResponse(r: StartSeriesResult): {
  status: number;
  body: Record<string, unknown>;
} {
  if (!r.ok) {
    return {
      status: 402,
      body: { error: r.error, needed: r.needed, balance: r.balance },
    };
  }
  if (r.started.length === 0) {
    return {
      status: 500,
      body: {
        error: "Couldn't start any scene — you have not been charged.",
        failed: r.failed,
      },
    };
  }
  return {
    status: 201,
    body: {
      seriesId: r.seriesId,
      jobs: r.started,
      failed: r.failed,
      creditCost: r.charged,
    },
  };
}
