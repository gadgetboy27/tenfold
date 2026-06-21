import * as Sentry from "@sentry/nextjs";

// DSN is read at RUNTIME from window.__PUBLIC_ENV__ (served by /api/public-env,
// loaded blocking in <head>) instead of a build-time-inlined NEXT_PUBLIC_*.
// Two reasons: (1) the inlined value went stale under Turbopack/Railway's build
// cache; (2) a runtime guard keeps the SDK from being tree-shaken out.
const dsn =
  typeof window !== "undefined"
    ? (window as unknown as { __PUBLIC_ENV__?: Record<string, string> })
        .__PUBLIC_ENV__?.NEXT_PUBLIC_SENTRY_DSN
    : undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === "production",
  });
}
