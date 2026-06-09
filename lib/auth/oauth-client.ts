"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * OAuth providers offered on the login/signup pages.
 * `linkedin_oidc` is the modern LinkedIn provider in Supabase — the universal
 * sign-in for B2B marketers, alongside Google and Facebook.
 */
export type OAuthProvider = "google" | "facebook" | "linkedin_oidc";

/**
 * Kick off a Supabase OAuth redirect. Falls back to the current origin if
 * NEXT_PUBLIC_APP_URL is unset so the callback URL is always valid.
 */
export async function signInWithOAuthProvider(
  provider: OAuthProvider,
): Promise<{ error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { error: "Auth is not configured" };

  const supabase = createBrowserClient(url, key);
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${appOrigin}/auth/callback` },
  });

  return { error: error?.message };
}
