import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getOrProvisionWorkspace } from "@/lib/auth/provisioning";
import { getRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

/**
 * Shared OAuth / magic-link / email-confirmation callback handler.
 *
 * Exposed at BOTH `/auth/callback` (app/auth/callback/route.ts) and `/callback`
 * (app/(auth)/callback/route.ts) so sign-in works regardless of which path is
 * configured in the Supabase dashboard's Redirect URLs. Point Supabase at
 * `/auth/callback` when convenient — the alias keeps older links working.
 */
export async function handleAuthCallback(
  request: NextRequest,
): Promise<NextResponse> {
  const { searchParams, origin, hash } = new URL(request.url);
  const code = searchParams.get("code");
  const token = searchParams.get("token");
  const type = searchParams.get("type");

  // Access token can arrive in the URL hash (some magic-link flows)
  const hashParams = new URLSearchParams(hash.slice(1));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  // Rate limit: 10 requests per minute per IP
  if (!checkRateLimit(getRateLimitKey(request), 10, 60000)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  if (!code && !token && !accessToken) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Build the redirect up front so Supabase session cookies are written onto it.
  const response = NextResponse.redirect(`${origin}/login?error=auth_failed`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let data: { user: AuthUser | null } | null = null;
  let error: unknown = null;

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    data = result.data;
    error = result.error;
  } else if (accessToken && refreshToken) {
    try {
      const result = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      data = result.data;
      error = result.error;
    } catch (err) {
      console.error("Magic link session error:", err);
      error = err;
    }
  } else if (token && type === "magiclink") {
    try {
      const result = await supabase.auth.verifyOtp({
        token_hash: token,
        type: "magiclink",
      });
      data = result.data;
      error = result.error;
    } catch (err) {
      console.error("Magic link OTP error:", err);
      error = err;
    }
  }

  if (error || !data?.user) {
    console.error("Auth callback error:", {
      error,
      code,
      token,
      type,
      accessToken: !!accessToken,
    });
    return response; // already points to /login?error=auth_failed
  }

  const user = data.user;
  const redirectTo = (url: string) => {
    response.headers.set("Location", url);
    return response;
  };

  // Idempotent first-login provisioning, shared with login/actions.ts and
  // api/workspaces/provision. Tolerates race-condition retries internally.
  try {
    const { slug } = await getOrProvisionWorkspace({
      id: user.id,
      email: user.email,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    });
    return redirectTo(`${origin}/${slug}`);
  } catch (err) {
    console.error("Workspace provisioning failed:", err);
    return redirectTo(`${origin}/login?error=workspace_failed`);
  }
}
