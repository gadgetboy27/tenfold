const META_API = "https://graph.facebook.com/v21.0";

// ── OAuth ──────────────────────────────────────────────────────────────────

export function getMetaOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: `${process.env.APP_URL}/api/social/callback/facebook`,
    scope: [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
    ].join(","),
    state,
    response_type: "code",
    // Force Facebook to re-show the permission + Page-selection step instead of
    // silently reusing a prior grant. Without this, a user who first authorized
    // only one Page keeps getting that cached single-Page grant back from
    // /me/accounts even after ticking more Pages on a reconnect.
    auth_type: "rerequest",
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: `${process.env.APP_URL}/api/social/callback/facebook`,
    code,
  });
  const res = await fetch(`${META_API}/oauth/access_token?${params}`);
  const data = (await res.json()) as {
    access_token?: string;
    error?: { message: string };
  };
  if (!res.ok || !data.access_token)
    throw new Error(data.error?.message ?? "Token exchange failed");
  return data.access_token;
}

// Short-lived user token → long-lived user token (60 days).
// Page access tokens obtained from a long-lived user token never expire.
export async function getLongLivedUserToken(
  shortToken: string,
): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${META_API}/oauth/access_token?${params}`);
  const data = (await res.json()) as {
    access_token?: string;
    error?: { message: string };
  };
  if (!res.ok || !data.access_token)
    throw new Error(data.error?.message ?? "Long-lived token exchange failed");
  return data.access_token;
}

// ── Page discovery ─────────────────────────────────────────────────────────

export interface FbPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
}

export async function getUserPages(userToken: string): Promise<FbPage[]> {
  // Follow pagination so every Page the user granted is captured, not just the
  // first response window. Meta only returns Pages the user actually selected in
  // the OAuth grant dialog — so if a Page is missing here, it wasn't granted.
  const pages: FbPage[] = [];
  let url: string | undefined =
    `${META_API}/me/accounts?fields=id,name,access_token,category&limit=100&access_token=${userToken}`;
  while (url) {
    const res = await fetch(url);
    const data = (await res.json()) as {
      data?: FbPage[];
      paging?: { next?: string };
      error?: { message: string };
    };
    if (!res.ok)
      throw new Error(data.error?.message ?? "Failed to fetch pages");
    pages.push(...(data.data ?? []));
    url = data.paging?.next;
  }
  return pages;
}

export interface IgAccount {
  id: string;
  username: string;
  name: string;
}

export async function getInstagramAccount(
  pageId: string,
  pageToken: string,
): Promise<IgAccount | null> {
  const res = await fetch(
    `${META_API}/${pageId}?fields=instagram_business_account{id,username,name}&access_token=${pageToken}`,
  );
  const data = (await res.json()) as {
    instagram_business_account?: IgAccount;
    error?: { message: string };
  };
  if (!res.ok || !data.instagram_business_account) return null;
  return data.instagram_business_account;
}

// ── Publishing: Facebook ───────────────────────────────────────────────────

export async function publishPhotoToFacebook(
  pageId: string,
  pageToken: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const res = await fetch(`${META_API}/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: imageUrl, caption, access_token: pageToken }),
  });
  const data = (await res.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!res.ok || !data.id)
    throw new Error(data.error?.message ?? "Facebook photo publish failed");
  return data.id;
}

export async function publishVideoToFacebook(
  pageId: string,
  pageToken: string,
  videoUrl: string,
  description: string,
): Promise<string> {
  const res = await fetch(`${META_API}/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_url: videoUrl,
      description,
      access_token: pageToken,
    }),
  });
  const data = (await res.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!res.ok || !data.id)
    throw new Error(data.error?.message ?? "Facebook video publish failed");
  return data.id;
}

export async function publishTextToFacebook(
  pageId: string,
  pageToken: string,
  message: string,
): Promise<string> {
  const res = await fetch(`${META_API}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: pageToken }),
  });
  const data = (await res.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!res.ok || !data.id)
    throw new Error(data.error?.message ?? "Facebook post failed");
  return data.id;
}

// ── Publishing: Instagram ──────────────────────────────────────────────────

export async function publishPhotoToInstagram(
  igUserId: string,
  pageToken: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const createRes = await fetch(`${META_API}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: pageToken,
    }),
  });
  const createData = (await createRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!createRes.ok || !createData.id)
    throw new Error(
      createData.error?.message ?? "Instagram media container creation failed",
    );

  const publishRes = await fetch(`${META_API}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: createData.id,
      access_token: pageToken,
    }),
  });
  const publishData = (await publishRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!publishRes.ok || !publishData.id)
    throw new Error(publishData.error?.message ?? "Instagram publish failed");
  return publishData.id;
}

export async function publishVideoToInstagram(
  igUserId: string,
  pageToken: string,
  videoUrl: string,
  caption: string,
): Promise<string> {
  // Create Reels container
  const createRes = await fetch(`${META_API}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: pageToken,
    }),
  });
  const createData = (await createRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!createRes.ok || !createData.id)
    throw new Error(
      createData.error?.message ?? "Instagram video container creation failed",
    );

  // Poll until the video is processed (max 5 min)
  const creationId = createData.id;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const statusRes = await fetch(
      `${META_API}/${creationId}?fields=status_code,status&access_token=${pageToken}`,
    );
    const statusData = (await statusRes.json()) as {
      status_code?: string;
      error?: { message: string };
    };
    if (statusData.status_code === "FINISHED") break;
    if (statusData.status_code === "ERROR")
      throw new Error("Instagram video processing failed on Meta's side");
  }

  // Publish
  const publishRes = await fetch(`${META_API}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId, access_token: pageToken }),
  });
  const publishData = (await publishRes.json()) as {
    id?: string;
    error?: { message: string };
  };
  if (!publishRes.ok || !publishData.id)
    throw new Error(
      publishData.error?.message ?? "Instagram video publish failed",
    );
  return publishData.id;
}
