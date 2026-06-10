import { NextResponse } from "next/server";

// Always evaluated at request time so it reflects the RUNTIME environment, not
// whatever was (or wasn't) inlined at build time.
export const dynamic = "force-dynamic";

// Serves the public Supabase config as a tiny script that sets
// window.__PUBLIC_ENV__. Loaded blocking in the root layout <head> so it runs
// before any client component creates a Supabase client.
//
// Bracket notation (process.env['NEXT_PUBLIC_*']) is intentional: Next inlines
// dot-accessed NEXT_PUBLIC_* at build time, but bracket access stays a genuine
// runtime lookup on the server.
export function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "",
    NEXT_PUBLIC_APP_URL: process.env["NEXT_PUBLIC_APP_URL"] ?? "",
  };

  return new NextResponse(`window.__PUBLIC_ENV__=${JSON.stringify(env)};`, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
