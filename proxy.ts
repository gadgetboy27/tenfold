export { proxy } from '@/lib/auth/middleware';

// config must be defined directly here — Turbopack can't statically parse re-exports
export const config = {
  // Exclude Next internals, webhooks, and any static asset file (anything with a
  // known asset extension) so public files like /landing/*.jpg and /brand/*.svg
  // are served directly instead of being run through auth gating.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mp3|woff|woff2|ttf)).*)',
  ],
};
