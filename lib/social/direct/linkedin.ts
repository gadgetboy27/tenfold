const LINKEDIN_WWW = "https://www.linkedin.com";
const LINKEDIN_API = "https://api.linkedin.com";

/**
 * LinkedIn's REST surface is versioned by a required header, and the version is
 * a YYYYMM string that they age out roughly a year after release. Pinned here
 * rather than scattered so the annual bump is one edit — and so a 426 "version
 * not supported" points straight at this constant.
 */
const LINKEDIN_VERSION = "202405";

/**
 * NOT verified against the live API. Every other adapter in this directory was
 * written against a working developer app; LinkedIn's could not be, because
 * creating the app and its credentials is the user's step (see
 * LINKEDIN_CLIENT_ID below). The shapes here follow LinkedIn's published
 * contract for /rest/posts and /rest/images, and the first real connection is
 * what proves them. Treat a 400 from either as "check this file first".
 */

/** A LinkedIn post body caps out well above any caption we generate. */
const MAX_COMMENTARY = 3000;

export function getLinkedInOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: `${process.env.APP_URL}/api/social/callback/linkedin`,
    state,
    // `openid profile` yields the member id from /v2/userinfo; `w_member_social`
    // is the one that actually permits posting. Requesting email as well would
    // widen the consent screen for data we never use.
    scope: "openid profile w_member_social",
  });
  return `${LINKEDIN_WWW}/oauth/v2/authorization?${params}`;
}

export interface LinkedInTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

async function tokenRequest(body: URLSearchParams): Promise<LinkedInTokens> {
  const res = await fetch(`${LINKEDIN_WWW}/oauth/v2/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? "LinkedIn token exchange failed",
    );
  }
  return {
    accessToken: data.access_token,
    // Refresh tokens are only issued to apps LinkedIn has granted them to.
    // Without one the connection simply expires and the user reconnects —
    // which is why the expiry is stored and surfaced rather than assumed.
    refreshToken: data.refresh_token ?? null,
    // Default to LinkedIn's standard 60 days when expires_in is absent.
    expiresAt: new Date(
      Date.now() + (data.expires_in ?? 60 * 24 * 3600) * 1000,
    ),
  };
}

export async function exchangeLinkedInCode(
  code: string,
): Promise<LinkedInTokens> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.APP_URL}/api/social/callback/linkedin`,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  );
}

export async function refreshLinkedInToken(
  refreshToken: string,
): Promise<LinkedInTokens> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  );
  // Same reasoning as Reddit: a refresh response may omit the refresh token,
  // and dropping it would leave nothing to present next time.
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}

export interface LinkedInIdentity {
  /** The bare member id. Callers build the URN — see personUrn(). */
  memberId: string;
  name: string | null;
}

export async function getLinkedInIdentity(
  accessToken: string,
): Promise<LinkedInIdentity> {
  const res = await fetch(`${LINKEDIN_API}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    sub?: string;
    name?: string;
  };
  if (!res.ok || !data.sub) {
    throw new Error("Could not read LinkedIn identity");
  }
  return { memberId: data.sub, name: data.name ?? null };
}

/** LinkedIn addresses people as URNs, never bare ids. */
function personUrn(memberId: string): string {
  return memberId.startsWith("urn:") ? memberId : `urn:li:person:${memberId}`;
}

function apiHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": LINKEDIN_VERSION,
    // Without this LinkedIn answers in its legacy Rest.li 1.0 encoding and the
    // response shapes below stop matching.
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

/**
 * Put an image on LinkedIn's CDN and return its URN.
 *
 * Three steps, none of them skippable: ask for an upload slot, PUT the bytes to
 * the single-use URL it hands back, then reference the returned URN in the post.
 * Unlike Reddit there is no link-unfurl shortcut — a LinkedIn post either
 * carries a real uploaded asset or it carries nothing.
 */
async function uploadImage(
  accessToken: string,
  owner: string,
  mediaUrl: string,
): Promise<string> {
  const init = await fetch(
    `${LINKEDIN_API}/rest/images?action=initializeUpload`,
    {
      method: "POST",
      headers: apiHeaders(accessToken),
      body: JSON.stringify({ initializeUploadRequest: { owner } }),
    },
  );
  const initData = (await init.json().catch(() => ({}))) as {
    value?: { uploadUrl?: string; image?: string };
    message?: string;
  };
  if (!init.ok || !initData.value?.uploadUrl || !initData.value.image) {
    throw new Error(
      initData.message ?? "LinkedIn would not start the image upload",
    );
  }

  const source = await fetch(mediaUrl);
  if (!source.ok) throw new Error("Could not read the image to upload");
  const bytes = await source.arrayBuffer();

  const put = await fetch(initData.value.uploadUrl, {
    method: "PUT",
    // The upload URL is pre-signed and expects the bytes alone — sending the
    // JSON API headers here is rejected.
    headers: { Authorization: `Bearer ${accessToken}` },
    body: bytes,
  });
  if (!put.ok) throw new Error("LinkedIn rejected the image upload");

  return initData.value.image;
}

/**
 * Post to the connected member's own feed.
 *
 * Personal feed only, deliberately: posting as a Company Page needs the
 * Community Management API, which is a separate LinkedIn review — the exact
 * cost that put LinkedIn on Ayrshare in the first place. Adding pages later is
 * a scope change here plus an organization URN as `author`.
 *
 * Video is refused rather than silently posted as text: LinkedIn videos use a
 * different initializeUpload flow with its own processing wait, and quietly
 * dropping someone's video would be worse than saying no.
 */
export async function publishToLinkedIn(params: {
  accessToken: string;
  memberId: string;
  mediaUrl: string;
  isVideo: boolean;
  caption: string;
}): Promise<{ id: string }> {
  if (params.isVideo) {
    throw new Error(
      "LinkedIn video isn't supported yet — it needs LinkedIn's separate video upload flow. Publish the image, or post the video to another network.",
    );
  }

  const author = personUrn(params.memberId);
  const imageUrn = await uploadImage(
    params.accessToken,
    author,
    params.mediaUrl,
  );

  const res = await fetch(`${LINKEDIN_API}/rest/posts`, {
    method: "POST",
    headers: apiHeaders(params.accessToken),
    body: JSON.stringify({
      author,
      commentary: params.caption.slice(0, MAX_COMMENTARY),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: { media: { id: imageUrn } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `LinkedIn rejected the post (${res.status})`);
  }

  // The post URN comes back in a header, not the body — an empty body here is
  // success, not a parse failure.
  const id =
    res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id") ?? "";
  return { id };
}
