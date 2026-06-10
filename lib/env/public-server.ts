export interface ServerPublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appUrl: string;
}

/**
 * Public config resolved at RUNTIME on the server.
 *
 * Next inlines dot-accessed `process.env.NEXT_PUBLIC_*` at build time (into the
 * server bundle too — verified). Bracket access is NOT inlined, so it stays a
 * genuine runtime lookup. Use this in server code that must work even when the
 * values were absent from the build environment (e.g. Railway).
 */
export function serverPublicEnv(): ServerPublicEnv {
  return {
    supabaseUrl: process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
    supabaseAnonKey: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "",
    appUrl: process.env["NEXT_PUBLIC_APP_URL"] ?? "",
  };
}
