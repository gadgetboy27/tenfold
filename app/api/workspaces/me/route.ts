import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// GET /api/workspaces/me — the caller's active workspace + role. Read-only and
// cheap, so it is exempt from the shared per-IP bucket; it used to return the
// error's stack trace as `detail`, which is gone with the wrapper's uniform
// error shape.
export const GET = withWorkspace(
  async (_req, { session }) =>
    NextResponse.json({
      workspaceId: session.workspaceId,
      slug: session.workspaceSlug,
      role: session.role,
    }),
  { rateLimit: false },
);
