/**
 * The contract every directly-integrated social network implements.
 *
 * Facebook and Instagram were wired straight into meta.ts because they were the
 * only direct integrations and Meta Page tokens effectively never expire. Every
 * network we add next is the opposite — LinkedIn's tokens last ~60 days,
 * TikTok's access token 24 hours, Reddit's one hour — so "connect" and "keep
 * working" have to be a shared shape rather than per-file bespoke code.
 *
 * Registering a provider here does NOT grant access to its API: TikTok audits
 * your app before it will publish anything publicly, and LinkedIn vets the
 * Community Management API before it will touch a company page. Those reviews
 * are the long pole; this registry is just what we hang the approved app on.
 */

export interface OAuthTokens {
  accessToken: string;
  /** Absent when the provider issues no refresh token (re-auth on expiry). */
  refreshToken?: string | null;
  /** Lifetime of accessToken. null/undefined = does not expire (Meta Pages). */
  expiresInSec?: number | null;
  /** Provider-specific extras to persist on the profile (ids, handles, scopes). */
  meta?: Record<string, unknown>;
}

export interface SocialProvider {
  /** Matches social_profiles.platform and the PLATFORM_META keys in the UI. */
  id: string;
  label: string;
  /** OAuth scopes requested at connect time. */
  scopes: string[];
  /** Where to send the user to authorise. `state` is the signed workspace id. */
  authUrl(state: string): string;
  /** Authorisation code → tokens. */
  exchangeCode(code: string): Promise<OAuthTokens>;
  /**
   * Refresh-token → new tokens. Omit when the provider's tokens never expire,
   * which is also the signal to getFreshAccessToken() that a stored token can
   * be used as-is forever.
   */
  refresh?(refreshToken: string): Promise<OAuthTokens>;
  /**
   * True when refreshing INVALIDATES the old refresh token and returns a new
   * one. TikTok does this; storing the replacement is then mandatory, and two
   * concurrent refreshes will leave one caller holding a dead token.
   */
  rotatesRefreshToken?: boolean;
}

const registry = new Map<string, SocialProvider>();

export function registerProvider(p: SocialProvider): void {
  registry.set(p.id, p);
}

export function getProvider(id: string): SocialProvider | null {
  return registry.get(id) ?? null;
}

/** Providers whose credentials are actually configured in this environment. */
export function listProviders(): SocialProvider[] {
  return [...registry.values()];
}

/** Redirect URI for a provider's callback. Registered on the provider's app
 *  console, so it must match byte-for-byte — hence one place to build it. */
export function callbackUrl(providerId: string): string {
  return `${process.env.APP_URL}/api/social/callback/${providerId}`;
}
