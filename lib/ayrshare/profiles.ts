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

export async function generateSocialConnectUrl(
  profileKey: string,
  // Where Ayrshare returns the user after they finish linking — pass the
  // Tenfold page to bounce them back into (e.g. the Publish step), so they
  // never sit stranded on the hosted linkage screen.
  redirect?: string,
): Promise<string> {
  const domain = process.env.AYRSHARE_DOMAIN;
  // PEM stored in env with literal \n — restore real newlines.
  const privateKey = process.env.AYRSHARE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!domain || !privateKey) {
    throw new Error(
      'Ayrshare hosted connect is not set up yet. In the Ayrshare dashboard (Business Plan) → User Profiles, generate a JWT key pair + domain, then set AYRSHARE_DOMAIN and AYRSHARE_PRIVATE_KEY.',
    );
  }
  const res = await fetch(`${AYRSHARE_BASE}/profiles/generateJWT`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      domain,
      privateKey,
      profileKey,
      ...(redirect ? { redirect } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ayrshare error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as AyrshareSocialConnectResponse;
  return data.url;
}
