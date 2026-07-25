/**
 * Turns Ayrshare's per-platform analytics payload (each platform uses
 * different field names — see docs.ayrshare.com/apis/analytics/post) into one
 * comparable number, so "which style performs best" can rank across a mix of
 * platforms instead of needing a metric-by-metric comparison.
 *
 * Deliberately approximate — a simple weighted sum (shares/reposts count for
 * more than likes, since they're a stronger signal), not a real engagement-
 * rate formula. Good enough for relative ranking ("A beat B"), not for
 * reporting an absolute number anywhere.
 */

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

type Metrics = Record<string, unknown>;

function score(m: Metrics): number {
  return (
    num(m.likeCount) +
    num(m.likes) +
    num(m.ups) * 2 +
    num(m.commentsCount) * 2 +
    num(m.commentCount) * 2 +
    num(m.comments) * 2 +
    num(m.repliesCount) * 2 +
    num(m.replyCount) * 2 +
    num(m.replies) * 2 +
    num(m.sharesCount) * 3 +
    num(m.shareCount) * 3 +
    num(m.shares) * 3 +
    num(m.repostCount) * 3 +
    num(m.reposts) * 3 +
    num(m.retweetCount) * 3 +
    num(m.quoteCount) * 3 +
    num(m.quotes) * 3 +
    num(m.save) * 2 +
    num(m.userFollow) * 3 +
    num(m.subscribersGained) * 5 +
    num(m.clickCount) * 2 +
    num(m.outboundClick) * 2 +
    num(m.pinClick) +
    num(m.profileVisit) +
    num(m.interactions) +
    num(m.completes) * 2 +
    // High-volume, low-intent metrics (impressions/views/reach) count for
    // much less per unit than an explicit action like a share.
    (num(m.impressionCount) + num(m.impression) + num(m.views) + num(m.videoViews) +
      num(m.mediaView) + num(m.reachCount) + num(m.viewsCount) + num(m.playsCount)) /
      100
  );
}

/** Twitter/X nests its counts under publicMetrics. */
function scoreTwitter(m: Metrics): number {
  const pub = (m.publicMetrics as Metrics | undefined) ?? {};
  return score(pub);
}

const PLATFORM_SCORERS: Record<string, (m: Metrics) => number> = {
  twitter: scoreTwitter,
  x: scoreTwitter,
};

/** `metrics` is the `analytics` object for one platform from Ayrshare's
 *  POST /api/analytics/post response — not the whole per-platform envelope. */
export function computeEngagementScore(platform: string, metrics: Metrics): number {
  const scorer = PLATFORM_SCORERS[platform] ?? score;
  return Math.round(scorer(metrics) * 100) / 100;
}
