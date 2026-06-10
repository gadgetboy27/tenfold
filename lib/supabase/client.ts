"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Returns `null` (instead of throwing) when the public
 * env vars are missing, so a misconfigured deploy degrades gracefully with a
 * clear message rather than crashing the whole page into the error boundary.
 *
 * NOTE: NEXT_PUBLIC_* vars are inlined at BUILD time. If these are undefined in
 * the browser, they were not present when `next build` ran — set them in the
 * build environment (e.g. Railway service variables) and redeploy.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error(
      "Supabase browser client unavailable: NEXT_PUBLIC_SUPABASE_URL / " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY are missing from the client bundle. " +
        "These are inlined at build time — set them in the build environment and redeploy.",
    );
    return null;
  }
  return createBrowserClient(url, key);
}
