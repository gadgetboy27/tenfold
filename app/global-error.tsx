"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Catches otherwise-unhandled React render errors at the root and reports them
// to Sentry. Safe no-op reporting when Sentry isn't initialised.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-900 px-6 text-center text-white">
        <div>
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="mt-2 text-sm text-slate-400">
            We&rsquo;ve been notified. Please refresh and try again.
          </p>
        </div>
      </body>
    </html>
  );
}
