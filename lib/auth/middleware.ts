import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const CORS_ALLOWED_ORIGINS =
  process.env.NODE_ENV === "production"
    ? [process.env.NEXT_PUBLIC_APP_URL || "https://tenfold.nz"]
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

  // Public routes (auth pages, marketing, OAuth callback) must always load and
  // never depend on a session lookup. Serve them immediately — this guarantees
  // /login renders even if Supabase is unreachable.
  const PUBLIC_PATHS = new Set([
    "/",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/callback",
    "/auth/callback",
  ]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No auth work for public paths, or if Supabase env is unavailable at runtime.
  if (PUBLIC_PATHS.has(pathname) || !supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request });
  }

  // Protected routes: refresh the Supabase cookie session and gate access.
  // Any failure here (network, Supabase down) must NOT crash the request —
  // fall through and serve the page; client-side guards re-check auth.
  let supabaseResponse = NextResponse.next({ request });
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isDashboard =
      pathname.startsWith("/dashboard") || !!pathname.match(/^\/[a-z0-9-]+\//);

    if (!user && isDashboard) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } catch (err) {
    console.error(
      "proxy: session refresh failed, serving page without redirect",
      err,
    );
    return NextResponse.next({ request });
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)"],
};
