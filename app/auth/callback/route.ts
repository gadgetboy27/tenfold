import { handleAuthCallback } from "@/lib/auth/oauth-callback";

// Primary OAuth / magic-link / email-confirm callback. All client and API
// redirects point here (${APP_URL}/auth/callback).
export const GET = handleAuthCallback;
