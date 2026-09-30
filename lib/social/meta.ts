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
      // Pages owned by a Business portfolio (Meta Business Suite) usually don't
      // appear in /me/accounts at all — they are only listed under the
      // business. Reading that list needs this scope. Opt-in, because asking a
      // live app for a permission it hasn't been approved for makes the
      // consent dialog error for everyone who isn't an app admin/tester.
      ...(process.env.META_BUSINESS_SCOPE === "true"
        ? ["business_management"]
        : []),
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

interface BusinessPagesResponse {
  data?: Partial<FbPage>[];
  paging?: { next?: string };
  error?: { message: string };
}

/**
 * Pages reachable through the user's Business portfolios — both ones the
 * business OWNS and ones it manages for a client. Needs `business_management`;
 * without it Meta answers with an error, which is swallowed here (the caller
 * still has /me/accounts) but logged so the reason is visible.
 *
 * A listed Page doesn't always carry its own access token, so any that lack
 * one are read individually with the user token (which works when the user has
 * a role on that Page through the business).
 */
export async function getBusinessPages(userToken: string): Promise<FbPage[]> {
  const out = new Map<string, FbPage>();
  const get = async <T>(url: string): Promise<T | null> => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };

  const biz = await get<{
    data?: { id: string; name?: string }[];
    error?: { message: string };
  }>(
    `${META_API}/me/businesses?fields=id,name&limit=50&access_token=${userToken}`,
  );
  if (!biz || biz.error) {
    console.error(
      "[Meta OAuth] /me/businesses unavailable:",
      biz?.error?.message ?? "no response",
    );
    return [];
  }

  for (const b of biz.data ?? []) {
    for (const edge of ["owned_pages", "client_pages"]) {
      let url: string | undefined =
        `${META_API}/${b.id}/${edge}?fields=id,name,access_token,category&limit=100&access_token=${userToken}`;
      while (url) {
        const page: BusinessPagesResponse | null =
          await get<BusinessPagesResponse>(url);
        if (!page || page.error) {
          console.error(
            `[Meta OAuth] ${edge} of business ${b.id} failed:`,
            page?.error?.message ?? "no response",
          );
          break;
        }
        for (const p of page.data ?? []) {
          if (!p.id || out.has(p.id)) continue;
          let token = p.access_token;
          let name = p.name;
          let category = p.category;
          if (!token) {
            const one = await get<Partial<FbPage> & { error?: unknown }>(
              `${META_API}/${p.id}?fields=id,name,category,access_token&access_token=${userToken}`,
            );
            token = one?.access_token;
            name = name ?? one?.name;
            category = category ?? one?.category;
          }
          // A Page we cannot get a token for cannot be published to — leave it
          // out rather than offering a Page that fails at the first post.
          if (token)
            out.set(p.id, {
              id: p.id,
              name: name ?? p.id,
              access_token: token,
              category: category ?? "",
            });
        }
        url = page.paging?.next;
      }
    }
  }
  return [...out.values()];
}

/** Every Page this login can publish to: the personal list plus the
 *  business-owned ones, de-duplicated by id (personal entry wins). */
export async function discoverPages(userToken: string): Promise<FbPage[]> {
  const personal = await getUserPages(userToken);
  const seen = new Set(personal.map((p) => p.id));
  const business = await getBusinessPages(userToken);
  return [...personal, ...business.filter((p) => !seen.has(p.id))];
}

/**
 * One log line describing what Facebook actually granted this login — for the
 * "connected but zero Pages" case, where the cause is entirely on Meta's side
 * (which permissions were ticked, which Pages they were scoped to, whether the
 * Pages sit under a business). Never contains a token.
 */
export async function describeMetaGrant(userToken: string): Promise<string> {
  const bits: string[] = [];
  const get = async (url: string) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      return { error: { message: e instanceof Error ? e.message : "fetch" } };
    }
  };
  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
    const dbg = (await get(
      `${META_API}/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(appToken)}`,
    )) as {
      data?: {
        is_valid?: boolean;
        type?: string;
        scopes?: string[];
        granular_scopes?: { scope: string; target_ids?: string[] }[];
      };
      error?: { message: string };
    };
    if (dbg.data) {
      bits.push(
        `token valid=${dbg.data.is_valid} type=${dbg.data.type} scopes=[${(dbg.data.scopes ?? []).join(",")}]`,
        `granular=[${(dbg.data.granular_scopes ?? []).map((g) => `${g.scope}:${g.target_ids?.length ?? "all"}`).join(",")}]`,
      );
    } else bits.push(`debug_token error: ${dbg.error?.message}`);
  }
  const perms = (await get(
    `${META_API}/me/permissions?access_token=${userToken}`,
  )) as {
    data?: { permission: string; status: string }[];
    error?: { message: string };
  };
  bits.push(
    perms.data
      ? `permissions=[${perms.data.map((p) => `${p.permission}:${p.status}`).join(",")}]`
      : `permissions error: ${perms.error?.message}`,
  );
  return bits.join(" | ");
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
