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
