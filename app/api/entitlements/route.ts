import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/billing/entitlements";

// GET — the active workspace's plan entitlements (drives Pro gating + upgrade CTAs).
export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const entitlements = await getEntitlements(session.workspaceId);
    return NextResponse.json(entitlements);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
