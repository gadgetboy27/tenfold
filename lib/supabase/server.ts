import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverPublicEnv } from "@/lib/env/public-server";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = serverPublicEnv();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies can't be written
          // during render. Safe to ignore — the middleware (proxy.ts) refreshes
          // the session cookie on the response instead. Without this catch the
          // throw becomes an unhandledRejection and blanks the page.
        }
      },
    },
  });
}
