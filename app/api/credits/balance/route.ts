import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getBalanceWithHistory } from "@/lib/credits/balance";

// Reference conversion to the withWorkspace routing layer: auth, rate-limiting
// and the 401/500 mapping are handled by the wrapper, so the handler is just
// the business logic. See lib/api/with-workspace.ts.
export const GET = withWorkspace(async (_req, { session }) => {
  const data = await getBalanceWithHistory(session.workspaceId);
  return NextResponse.json(data);
});
