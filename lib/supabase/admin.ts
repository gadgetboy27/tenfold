import { createClient } from "@supabase/supabase-js";
import { serverPublicEnv } from "@/lib/env/public-server";

// Service-role client — bypasses RLS. Use only in webhook handlers.
export function createSupabaseAdminClient() {
  // URL resolved at runtime (serverPublicEnv) so it works even when the build
  // didn't inline NEXT_PUBLIC_SUPABASE_URL. Service-role key is non-public and
  // already a runtime lookup.
  return createClient(
    serverPublicEnv().supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
