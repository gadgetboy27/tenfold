import * as Sentry from "@sentry/nextjs";

// A Sentry DSN is PUBLIC by design (it ships in the client bundle), so it's
// hardcoded here for reliability. Env-based approaches proved fragile in this
// stack: build-time inlining went stale under Turbopack/Railway's cache, and a
// runtime read from window.__PUBLIC_ENV__ raced ahead of the head script that
// sets it. The `enabled` guard keeps it production-only.
Sentry.init({
  dsn: "https://7547ef1cdd89cf1307f089e9c7cf5231@o4510273389068288.ingest.us.sentry.io/4511604928479232",
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
