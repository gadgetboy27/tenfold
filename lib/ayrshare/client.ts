const AYRSHARE_BASE = "https://app.ayrshare.com/api";

export interface AyrsharePostPayload {
  post: string;
  platforms: string[];
  mediaUrls: string[];
  scheduleDate?: string;
  hashtags?: string[];
  shortenLinks?: boolean;
}

/**
 * One entry per post attempt, in the response's `posts` array.
 *
 * Shapes verified against the live API, NOT the published docs — those describe
 * a top-level `id` plus `postIds[]`/`errors[]` that the API does not return.
 * Coding to the docs is why this integration silently recorded the literal
 * string "posted" for every publish.
 *
 *   success   { status: "success",   id, refId, profileTitle, post }
 *   scheduled { status: "scheduled", id, scheduleDate, refId, … }
 *   error     { status: "error",     code, message, details, profileTitle }
 *
 * `id` is Ayrshare's post id — the handle for delete/analytics. The social
 * network's own id (e.g. urn:li:share:…) resolves asynchronously and only
 * appears later, via /history.
 */
export interface AyrsharePostEntry {
  status: string;
  action?: string;
  id?: string;
  scheduleDate?: string;
  refId?: string;
  profileTitle?: string;
  post?: string;
  code?: number;
  message?: string;
  details?: string;
}

export interface AyrsharePostResult {
  /** "success" when the request was accepted, "error" when it was not. */
  status: string;
  posts?: AyrsharePostEntry[];
  validate?: boolean;
}

/** A post Ayrshare would not publish. Carries the platform's own words so the
 *  user sees why, rather than a generic failure. */
export class AyrsharePublishError extends Error {
  constructor(
    message: string,
    readonly platform?: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "AyrsharePublishError";
  }
}

/**
 * Publish (or schedule) to ONE platform. Returns Ayrshare's post id, or throws
 * with the reason it didn't land.
 *
 * Two traps this exists to close:
 *
 *  1. Ayrshare answers HTTP 200 even when a post completely fails — the outcome
 *     is in the body. `if (!res.ok)` alone never catches anything.
 *  2. The outcome lives in `posts[]`, not the `postIds[]`/`errors[]`/top-level
 *     `id` the docs describe. Reading the documented fields finds nothing at
 *     all, which is how every Ayrshare publish came to be recorded as the
 *     literal string "posted" — success and failure alike.
 */
export async function ayrsharePost(
  profileKey: string,
  payload: AyrsharePostPayload,
): Promise<{ id: string; scheduled: boolean }> {
  const res = await fetch(`${AYRSHARE_BASE}/post`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      "Profile-Key": profileKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await res
    .json()
    .catch(() => null)) as AyrsharePostResult | null;
  const platform = payload.platforms[0];
  const entry = body?.posts?.[0];

  if (!body) {
    throw new AyrsharePublishError(
      `Ayrshare returned an unreadable response (${res.status})`,
      platform,
    );
  }

  // The per-post entry carries the real reason ("Error accessing the media…",
  // "Status is a duplicate."). Prefer it over the bare status, and prefer
  // `details` alongside `message` — together they say what to actually fix.
  if (body.status === "error" || entry?.status === "error") {
    const why = [entry?.message, entry?.details].filter(Boolean).join(" ");
    throw new AyrsharePublishError(
      why || `Ayrshare rejected the post${res.ok ? "" : ` (${res.status})`}`,
      platform,
      entry?.code,
    );
  }

  // Transport/auth failures that carried no usable entry.
  if (!res.ok) {
    throw new AyrsharePublishError(`Ayrshare error ${res.status}`, platform);
  }

  if (!entry?.id) {
    throw new AyrsharePublishError(
      "Ayrshare accepted the post but returned no id",
      platform,
    );
  }

  return { id: entry.id, scheduled: entry.status === "scheduled" };
}

export async function ayrshareGetProfiles(
  profileKey: string,
): Promise<unknown> {
  const res = await fetch(`${AYRSHARE_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      "Profile-Key": profileKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ayrshare error ${res.status}: ${body}`);
  }

  return res.json();
}
