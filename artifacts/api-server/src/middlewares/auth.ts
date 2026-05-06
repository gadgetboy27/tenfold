import { type Request, type Response, type NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { db } from "@workspace/db";
import {
  workspaces,
  workspaceMembers,
  creditAccounts,
  creditTransactions,
} from "@workspace/db";
import { eq, or } from "drizzle-orm";

function getSupabase() {
  const url = process.env["SUPABASE_URL"] ?? process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"];
  const slug = (req.headers["x-workspace-slug"] as string | undefined) ?? "";

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  // ── Validate token with Supabase ───────────────────────────────────────────
  let userId: string;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    userId = data.user.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Auth error";
    res.status(500).json({ error: msg });
    return;
  }

  // ── Resolve workspace ──────────────────────────────────────────────────────
  try {
    // Match by slug first; fall back to finding the workspace owned by this user
    // (handles the case where slug = userId for newly provisioned workspaces)
    const workspace = await db.query.workspaces.findFirst({
      where: or(eq(workspaces.slug, slug), eq(workspaces.ownerId, userId)),
    });

    if (!workspace) {
      res.status(403).json({ error: "Workspace not found" });
      return;
    }

    if (workspace.ownerId !== userId) {
      const member = await db.query.workspaceMembers.findFirst({
        where: eq(workspaceMembers.workspaceId, workspace.id),
      });
      if (!member) {
        res.status(403).json({ error: "Not a workspace member" });
        return;
      }
    }

    req.userId = userId;
    req.workspaceId = workspace.id;
    req.workspaceSlug = workspace.slug;
    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    res.status(500).json({ error: msg });
  }
}

// ── Shared credit debit (used by campaigns + jobs routes) ─────────────────
export async function debitCredits(
  workspaceId: string,
  jobId: string,
  type: string,
  cost: number,
): Promise<{ success: boolean; newBalance: number }> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.workspaceId, workspaceId))
      .for("update");

    if (!account || account.cachedBalance < cost) {
      return { success: false, newBalance: account?.cachedBalance ?? 0 };
    }

    const newBalance = account.cachedBalance - cost;

    await tx.insert(creditTransactions).values({
      workspaceId,
      jobId,
      type: "spend",
      amount: -cost,
      balanceAfter: newBalance,
      description: `${type} job`,
    });

    await tx
      .update(creditAccounts)
      .set({ cachedBalance: newBalance, updatedAt: new Date() })
      .where(eq(creditAccounts.workspaceId, workspaceId));

    return { success: true, newBalance };
  });
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      workspaceId?: string;
      workspaceSlug?: string;
    }
  }
}
