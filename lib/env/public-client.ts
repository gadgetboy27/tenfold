export interface PublicEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

/**
 * Resolve public env on the client.
 *
 * Order:
 *  1. `window.__PUBLIC_ENV__` — injected at runtime by /api/public-env (loaded in
 *     the root layout). This works even when the values were NOT present at
 *     `next build` time, which is the failure mode on platforms that don't pass
 *     build-time env (the "@supabase/ssr: URL and API key are required" crash).
 *  2. Build-time inlined `process.env.NEXT_PUBLIC_*` as a fallback for local dev
 *     and correctly-configured builds. (Dot access is safe in the browser bundle.)
 */
export function getPublicEnv(): PublicEnv {
  if (typeof window !== "undefined") {
    const injected = (window as unknown as { __PUBLIC_ENV__?: PublicEnv })
      .__PUBLIC_ENV__;
    if (injected?.NEXT_PUBLIC_SUPABASE_URL) return injected;
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}
