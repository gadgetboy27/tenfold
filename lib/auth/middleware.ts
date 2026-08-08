import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { serverPublicEnv } from "@/lib/env/public-server";
import { isProtectedPath } from "@/lib/auth/public-paths";
import { staleAuthCookieNames } from "@/lib/supabase/cookie-name";

const CORS_ALLOWED_ORIGINS =
  process.env.NODE_ENV === "production"
    ? [process.env.NEXT_PUBLIC_APP_URL || "https://prettymuch.nz"]
    : ["http://localhost:3000", "http://127.0.0.1:3000"];

function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = CORS_ALLOWED_ORIGINS.some(
    (allowed) =>
      allowed && origin?.includes(allowed.replace(/^https?:\/\//, "")),
  )
    ? origin
    : CORS_ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin || "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type,Authorization,x-workspace-slug",
  };
}

export async function proxy(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin || undefined);

  // Return CORS preflight immediately — no auth needed
  if (request.method === "OPTIONS" && isApiRoute) {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  // API routes: add CORS headers and security headers, skip cookie session refresh
  // Auth is handled per-route via Bearer token in getSession()
  if (isApiRoute) {
    const response = NextResponse.next({ request });
    Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
    // Security headers
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    return response;
  }

  // Non-API routes.
  const { pathname } = request.nextUrl;

  const { supabaseUrl, supabaseAnonKey: supabaseKey } = serverPublicEnv();

  // Always-public, no session work needed: the marketing home, the OAuth/email
  // callback (which establishes the session itself), or when Supabase env is
  // unavailable at runtime — so these always render.
  // Expire Supabase auth cookies left over from a previous cookie-name
  // derivation. They are still sent on every request, grow with each sign-in,
  // and eventually push the Cookie header past Node's 16KB limit — which
  // surfaced as HTTP 431 on every authenticated fetch (empty gallery, missing
  // projects, a credit balance stuck at 0). Users can't be expected to know to
  // clear cookies, so this cleans up for them. See lib/supabase/cookie-name.ts.
  const stale = staleAuthCookieNames(request.cookies.getAll());
  const clearStale = (res: NextResponse): NextResponse => {
    for (const name of stale) {
      res.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
    return res;
  };

  const ALWAYS_PUBLIC = new Set(["/", "/callback", "/auth/callback"]);
  if (ALWAYS_PUBLIC.has(pathname) || !supabaseUrl || !supabaseKey) {
    return clearStale(NextResponse.next({ request }));
  }

  // For everything else (auth pages + protected routes) refresh the Supabase
  // cookie session. Any failure here (network, Supabase down) must NOT crash the
  // request — serve the page so /login still renders and client guards re-check.
  let supabaseResponse = NextResponse.next({ request });
  let user = null;
  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch (err) {
    console.error(
      "proxy: session refresh failed, serving page without redirect",
      err,
    );
    return NextResponse.next({ request });
  }

  // Already signed in on this browser? Don't make returning users re-authenticate
  // — send them straight to their workspace from the login/signup pages.
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  if (user && isAuthPage) {
    const slug = user.user_metadata?.workspace_slug as string | undefined;
    if (slug) {
      return NextResponse.redirect(new URL(`/${slug}`, request.url));
    }
  }

  // Public pages (login/signup without a workspace yet, password reset, and
  // public sections like /guides/*) render normally — with the session cookie
  // refreshed above. The rule lives in lib/auth/public-paths.ts because a
  // public two-segment path is indistinguishable from /{workspace}/{page};
  // see the note there.
  if (!isProtectedPath(pathname)) {
    return clearStale(supabaseResponse);
  }

  // Protected routes: gate unauthenticated visitors to /login.
  if (!user) {
    return clearStale(NextResponse.redirect(new URL("/login", request.url)));
  }

  return clearStale(supabaseResponse);
}

export const config = {
  // Keep in sync with proxy.ts (the active config). Static asset extensions are
  // excluded so public files (/landing/*.jpg, /brand/*.svg) aren't auth-gated.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mp3|woff|woff2|ttf)).*)",
  ],
};
