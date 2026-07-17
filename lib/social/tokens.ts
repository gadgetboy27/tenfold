import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProvider, type OAuthTokens } from "@/lib/social/providers";

/**
 * Keeps stored OAuth access tokens usable.
 *
 * Nothing refreshed tokens before this: social_profiles has carried
 * refresh_token and token_expires_at since the schema was written, but no code
 * read them. Facebook and Instagram got away with it because Meta Page tokens
 * effectively never expire. Every network we add next has a short-lived access
 * token — LinkedIn ~60 days, TikTok 24 hours, Reddit one hour — so without this
 * a connected account silently stops publishing a day after it's linked.
 *
 * Publishing paths must call getFreshAccessToken() rather than reading
 * profile.access_token directly.
 */

/** Refresh this far before actual expiry, so a token can't die mid-request. */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

/** Thrown when a connection can only be restored by the user re-authorising. */
export class ReconnectRequiredError extends Error {
  constructor(readonly platform: string) {
    super(`Reconnect ${platform} in Settings → Social to keep publishing.`);
    this.name = "ReconnectRequiredError";
  }
}

export interface StoredProfile {
  workspace_id: string;
  platform: string;
  access_token: string | null;
  refresh_token: string | null;
  /** ISO timestamp, or null when the token does not expire. */
  token_expires_at: string | null;
}

function expiresAtIso(tokens: OAuthTokens): string | null {
  if (tokens.expiresInSec == null) return null;
  return new Date(Date.now() + tokens.expiresInSec * 1000).toISOString();
}

/**
 * In-flight refreshes, keyed by workspace+platform.
 *
 * A rotating provider (TikTok) invalidates the old refresh token the moment
 * it issues a new one, so two simultaneous refreshes leave the loser holding a
 * dead token and force the user to reconnect for no reason. This collapses the
 * common case — one process, several publishes at once — into a single call.
 *
 * It is deliberately NOT a distributed lock: two server instances refreshing
 * the same profile in the same second can still race. That costs one
 * reconnect, and a real lock costs a shared store; revisit if it ever shows up
 * in practice rather than paying for it upfront.
 */
const inFlight = new Map<string, Promise<string>>();

/**
 * A usable access token for this profile, refreshing it first if it is expired
 * or about to be. Persists the new token (and any rotated refresh token) before
 * returning.
 *
 * Throws ReconnectRequiredError when the token is dead and cannot be renewed —
 * callers should surface that per-platform rather than failing a whole publish.
 */
export async function getFreshAccessToken(
  profile: StoredProfile,
): Promise<string> {
  if (!profile.access_token) throw new ReconnectRequiredError(profile.platform);

  // No expiry recorded = a token that does not expire (Meta Pages). Use it.
  if (!profile.token_expires_at) return profile.access_token;

  const expiresAt = Date.parse(profile.token_expires_at);
  const stale =
    Number.isFinite(expiresAt) && expiresAt - Date.now() <= EXPIRY_SKEW_MS;
  if (!stale) return profile.access_token;

  const key = `${profile.workspace_id}:${profile.platform}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const run = refreshAndStore(profile).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function refreshAndStore(profile: StoredProfile): Promise<string> {
  const provider = getProvider(profile.platform);
  // No provider, no refresh support, or no stored refresh token: the access
  // token is expired and nothing can renew it.
  if (!provider?.refresh || !profile.refresh_token) {
    throw new ReconnectRequiredError(profile.platform);
  }

  let tokens: OAuthTokens;
  try {
    tokens = await provider.refresh(profile.refresh_token);
  } catch {
    // A rejected refresh token means revoked access or a rotation we lost —
    // either way the only fix is the user reconnecting.
    throw new ReconnectRequiredError(profile.platform);
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("social_profiles")
    .update({
      access_token: tokens.accessToken,
      // Keep the old refresh token when the provider didn't issue a new one;
      // overwriting it with null would break every later refresh.
      refresh_token: tokens.refreshToken ?? profile.refresh_token,
      token_expires_at: expiresAtIso(tokens),
    })
    .eq("workspace_id", profile.workspace_id)
    .eq("platform", profile.platform);

  // A rotating provider has already invalidated the old refresh token, so if we
  // can't store the new one the connection is unrecoverable — say so now rather
  // than let it fail confusingly on the next publish.
  if (error && provider.rotatesRefreshToken) {
    throw new ReconnectRequiredError(profile.platform);
  }

  return tokens.accessToken;
}

/** Persist a freshly-connected account. Shared by every provider's callback. */
export async function saveConnection(opts: {
  workspaceId: string;
  platform: string;
  tokens: OAuthTokens;
  handle?: string | null;
  displayName?: string | null;
  platformAccountId?: string | null;
  platformPageId?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("social_profiles").upsert(
    {
      workspace_id: opts.workspaceId,
      platform: opts.platform,
      access_token: opts.tokens.accessToken,
      refresh_token: opts.tokens.refreshToken ?? null,
      token_expires_at: expiresAtIso(opts.tokens),
      handle: opts.handle ?? null,
      profile_display_name: opts.displayName ?? null,
      platform_account_id: opts.platformAccountId ?? null,
      platform_page_id: opts.platformPageId ?? null,
      metadata: opts.tokens.meta ?? {},
      connected_at: new Date().toISOString(),
    },
    // Reconnecting must replace the old row, not fail: social_profiles is
    // unique on (workspace_id, platform).
    { onConflict: "workspace_id,platform" },
  );
  if (error)
    throw new Error(`Could not save ${opts.platform}: ${error.message}`);
}
