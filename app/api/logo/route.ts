import { NextResponse } from "next/server";
import { isEnabled } from "@/lib/flags";

/**
 * Logo builder API — scaffold.
 *
 * Every logo route must gate on the flag FIRST and return a real 404 when off,
 * so the endpoint is genuinely absent in production until launch — not a
 * reachable stub. Copy this guard into each new logo route.
 */
export async function POST(): Promise<Response> {
  if (!isEnabled("logoBuilder")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Real logic goes here (auth, credit debit, generation). Until then, a
  // clear signal that the gate opened.
  return NextResponse.json({ ok: true, feature: "logoBuilder" });
}
