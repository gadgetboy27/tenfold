import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { checkAllApiKeys } from "@/lib/diagnostics/api-health";

// GET /api/diagnostics/health — probes every upstream API key with a live
// call. Any workspace member may ask, but each request is five outbound
// requests to third parties, so it gets a tight limit rather than the default.
export const GET = withWorkspace(
  async () => {
    const results = await checkAllApiKeys();
    const allValid = results.every((r) => r.valid);
    return NextResponse.json({ ok: allValid, services: results });
  },
  { rateLimit: 10 },
);
