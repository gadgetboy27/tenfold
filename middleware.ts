export { middleware } from '@/lib/auth/middleware';

// config must be defined directly here — Turbopack can't statically parse re-exports
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
};
