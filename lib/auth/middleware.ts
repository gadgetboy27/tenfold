import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const CORS_ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? [process.env.NEXT_PUBLIC_APP_URL || 'https://tenfold.nz']
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = CORS_ALLOWED_ORIGINS.some(allowed => allowed && origin?.includes(allowed.replace(/^https?:\/\//, '')))
    ? origin
    : CORS_ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-workspace-slug',
  };
}

export async function proxy(request: NextRequest) {
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin || undefined);

  // Return CORS preflight immediately — no auth needed
  if (request.method === 'OPTIONS' && isApiRoute) {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  // API routes: add CORS headers and skip cookie session refresh
  // Auth is handled per-route via Bearer token in getSession()
  if (isApiRoute) {
    const response = NextResponse.next({ request });
    Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }

  // Non-API routes: refresh Supabase cookie session
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isDashboard =
    request.nextUrl.pathname.startsWith('/dashboard') ||
    !!request.nextUrl.pathname.match(/^\/[a-z0-9-]+\//);

  if (!user && isDashboard) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
};
