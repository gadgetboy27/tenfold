import { handleAuthCallback } from "@/lib/auth/oauth-callback";

// Alias of /auth/callback — kept so Supabase configs pointing at /callback keep
// working. Shared logic lives in lib/auth/oauth-callback.ts.
export const GET = handleAuthCallback;
