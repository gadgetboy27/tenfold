/**
 * Which video does this campaign publish?
 *
 * For most of the product's life the answer was "whichever is newest" —
 * computed independently in `/api/publish`, in Studio's rehydrate, and on the
 * Productions page. That is a guess, and it moves under the user: exporting a
 * variant to compare it silently changed what would post. Campaign 62cc89cd
 * ("Stellar Launch") reached 9 branded exports and 14 music takes with no way
 * to delete one and nothing saying which was the keeper.
 *
 * `campaigns.publish_asset_id` (migration 0032) makes it the user's answer
 * instead of a heuristic. This module is that rule in one place, pure and
 * testable, so the server and the two client surfaces cannot drift apart.
 */

export interface CampaignVideo {
  id: string;
  url: string;
  type: string;
  createdAt: string;
}

export type VideoPick<T extends CampaignVideo> =
  /** Exactly one video is in play — publish it. */
  | { status: "ok"; video: T; chosen: boolean }
  /** No video at all; the caller falls back to an image or refuses. */
  | { status: "none" }
  /** Several videos, none picked. Refuse rather than guess. */
  | { status: "ambiguous"; count: number };

/** Newest first. Ties broken by id so the order is total, never arbitrary. */
function newestFirst<T extends CampaignVideo>(videos: readonly T[]): T[] {
  return [...videos].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}

/**
 * Resolve the campaign's publishable video.
 *
 * A `pickedId` that matches nothing is treated as no pick at all — the asset
 * was deleted between choosing and posting, which makes the campaign ambiguous
 * again rather than letting a dangling id fall through to "newest".
 *
 * With no pick and a SINGLE video there is nothing to be ambiguous about, so
 * it resolves silently; that keeps every existing one-video campaign working
 * without anyone having to go and tick a box.
 */
export function resolvePublishVideo<T extends CampaignVideo>(
  videos: readonly T[],
  pickedId: string | null | undefined,
): VideoPick<T> {
  if (videos.length === 0) return { status: "none" };

  const picked = pickedId
    ? (videos.find((v) => v.id === pickedId) ?? null)
    : null;
  if (picked) return { status: "ok", video: picked, chosen: true };

  if (videos.length === 1)
    return { status: "ok", video: videos[0], chosen: false };

  return { status: "ambiguous", count: videos.length };
}

/**
 * What the canvas should SHOW, which is a softer question than what publishes.
 *
 * A screen must render something; it is not allowed to refuse. So the pick
 * wins when there is one, and otherwise this falls back to the old order —
 * newest first, branded exports ahead of raw clips at the same instant, since
 * a `composed_video` carries the overlays and brand work the raw Kling output
 * does not.
 */
export function displayVideo<T extends CampaignVideo>(
  videos: readonly T[],
  pickedId: string | null | undefined,
): T | null {
  if (videos.length === 0) return null;
  const picked = pickedId ? videos.find((v) => v.id === pickedId) : undefined;
  if (picked) return picked;
  const ranked = newestFirst(videos);
  return (
    ranked.find(
      (v) => v.type === "composed_video" && v.createdAt === ranked[0].createdAt,
    ) ?? ranked[0]
  );
}

/** The message shown when a campaign holds several videos and none is picked. */
export function ambiguousVideoMessage(count: number): string {
  return `This project has ${count} videos — pick the one to publish, or delete the ones you don't want. Publishing won't choose for you.`;
}
