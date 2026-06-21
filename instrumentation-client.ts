import * as Sentry from "@sentry/nextjs";

// Browser-side error tracking. No-ops until NEXT_PUBLIC_SENTRY_DSN is set (it
// must be present at BUILD time on Railway, since NEXT_PUBLIC_ vars are inlined
// into the client bundle).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === "production",
  });
}
