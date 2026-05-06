const AYRSHARE_BASE = 'https://app.ayrshare.com/api';

interface AyrshareProfileResponse {
  profileKey: string;
  title: string;
}

interface AyrshareUserResponse {
  activeSocialAccounts?: string[];
}

interface AyrshareSocialConnectResponse {
  url: string;
}

export async function createAyrshareProfile(title: string): Promise<{ profileKey: string }> {
  const res = await fetch(`${AYRSHARE_BASE}/profiles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ayrshare error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as AyrshareProfileResponse;
  return { profileKey: data.profileKey };
}

export async function getConnectedPlatforms(profileKey: string): Promise<string[]> {
  const res = await fetch(`${AYRSHARE_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      'Profile-Key': profileKey,
    },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as AyrshareUserResponse;
  return data.activeSocialAccounts ?? [];
}

export async function generateSocialConnectUrl(profileKey: string): Promise<string> {
  const res = await fetch(`${AYRSHARE_BASE}/profiles/generateJWT`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ profileKey }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ayrshare error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as AyrshareSocialConnectResponse;
  return data.url;
}
