const AYRSHARE_BASE = 'https://app.ayrshare.com/api';

export interface AyrsharePostPayload {
  post: string;
  platforms: string[];
  mediaUrls: string[];
  scheduleDate?: string;
  hashtags?: string[];
  shortenLinks?: boolean;
}

export interface AyrsharePostResult {
  status: string;
  id: string;
  postIds?: Array<{ status: string; platform: string; id?: string; error?: string }>;
}

export async function ayrsharePost(
  profileKey: string,
  payload: AyrsharePostPayload,
): Promise<AyrsharePostResult> {
  const res = await fetch(`${AYRSHARE_BASE}/post`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      'Profile-Key': profileKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ayrshare error ${res.status}: ${body}`);
  }

  return res.json() as Promise<AyrsharePostResult>;
}

export interface AyrsharePostAnalytics {
  status: string;
  id: string;
  errors?: Array<{ platform: string; status: string; code: number; message: string }>;
  // Every other top-level key is a platform name -> { id, postUrl, analytics, ... }.
  [platform: string]: unknown;
}

/** POST /api/analytics/post — real-time analytics for a post Ayrshare sent,
 *  looked up by the Ayrshare post id (the top-level `id` ayrsharePost()
 *  returns, NOT a platform-native post id). */
export async function ayrsharePostAnalytics(
  profileKey: string,
  ayrsharePostId: string,
): Promise<AyrsharePostAnalytics> {
  const res = await fetch(`${AYRSHARE_BASE}/analytics/post`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      'Profile-Key': profileKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: ayrsharePostId }),
  });

  // 404 means the post has no analytics yet (or on no platform) — treat as
  // "nothing to report" rather than an error the caller has to special-case.
  if (res.status === 404) {
    return { status: 'error', id: ayrsharePostId };
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ayrshare error ${res.status}: ${body}`);
  }

  return res.json() as Promise<AyrsharePostAnalytics>;
}

export async function ayrshareGetProfiles(profileKey: string): Promise<unknown> {
  const res = await fetch(`${AYRSHARE_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      'Profile-Key': profileKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ayrshare error ${res.status}: ${body}`);
  }

  return res.json();
}
