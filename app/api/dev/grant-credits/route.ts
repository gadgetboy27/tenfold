import { NextResponse } from "next/server";
import { isOpsRequest } from "@/lib/api/ops-auth";
import { withWorkspace } from "@/lib/api/with-workspace";

const GRANT_AMOUNT = 500;

// Dev-only test top-up. Three locks: not production, the ops secret, and a
// real workspace session (withWorkspace) so the grant lands on the caller's
// own workspace rather than one named in the body.
export const POST = withWorkspace(async (req, { db, session }) => {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 },
    );
  }
  // Second lock: even off production this mints workspaces / credits, so it
  // takes the ops secret too. A deployment that forgot NODE_ENV is one env
  // var from exposing it otherwise, and "one env var" is not a control.
  if (!isOpsRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: account } = await db
    .from("credit_accounts")
    .select("cached_balance")
    .single();

  if (!account) throw new Error("Credit account not found");

  const newBalance =
    (account as { cached_balance: number }).cached_balance + GRANT_AMOUNT;

  await db.from("credit_transactions").insert({
    workspace_id: session.workspaceId,
    type: "grant",
    amount: GRANT_AMOUNT,
    balance_after: newBalance,
    description: "Test credit top-up",
  });

  await db.from("credit_accounts").update({ cached_balance: newBalance });

  return NextResponse.json({ granted: GRANT_AMOUNT });
});
