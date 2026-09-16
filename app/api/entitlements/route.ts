import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getEntitlements } from "@/lib/billing/entitlements";

// GET — the active workspace's plan entitlements (drives Pro gating + upgrade CTAs).
export const GET = withWorkspace(
  async (_req, { session }) =>
    NextResponse.json(await getEntitlements(session.workspaceId)),
  { rateLimit: false },
);
