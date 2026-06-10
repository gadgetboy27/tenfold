"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public-client";

/**
 * Browser Supabase client. Resolves config from runtime injection first
 * (window.__PUBLIC_ENV__, set by /api/public-env) then build-time inlining, and
 * returns `null` (instead of throwing) when neither is available — so a
 * misconfigured deploy degrades gracefully with a clear message instead of
 * crashing the whole page into the error boundary.
 */
export function createSupabaseBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } =
    getPublicEnv();
  if (!url || !key) {
    console.error(
      "Supabase browser client unavailable: NEXT_PUBLIC_SUPABASE_URL / " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY are missing at both runtime and build time. " +
        "Set them in the deploy environment (Railway service variables) and redeploy.",
    );
    return null;
  }
  return createBrowserClient(url, key);
}
