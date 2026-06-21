import * as Sentry from "@sentry/nextjs";

// Server/edge error tracking. Fully no-ops until NEXT_PUBLIC_SENTRY_DSN is set,
// so this is safe to ship before a Sentry project exists. Add the DSN in Railway
// and redeploy to switch it on.
export async function register() {
  // Bracket access stays a RUNTIME lookup — dot-access NEXT_PUBLIC_* is inlined
  // at build (which went stale on Railway), bracket access reads the live env.
  const dsn = process.env["NEXT_PUBLIC_SENTRY_DSN"];
  if (!dsn) return;

  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0.1,
      enabled: process.env.NODE_ENV === "production",
    });
  }
}

// Captures errors thrown in server components and route handlers (App Router).
export const onRequestError = Sentry.captureRequestError;
