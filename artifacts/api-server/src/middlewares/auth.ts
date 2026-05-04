import { type Request, type Response, type NextFunction } from "express";

/**
 * Auth middleware — validates Bearer token from Supabase.
 *
 * TODO (real implementation):
 *   import { createClient } from "@supabase/supabase-js";
 *   const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
 *   const { data: { user }, error } = await supabase.auth.getUser(token);
 *   if (error || !user) return res.status(401).json({ error: "Unauthorized" });
 *   req.user = user;
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];

  // Dev bypass — skip auth if no token provided and NODE_ENV is development
  if (!authHeader && process.env["NODE_ENV"] === "development") {
    req.userId = "dev-user-001";
    req.workspaceSlug = (req.headers["x-workspace-slug"] as string) || "dev-workspace";
    next();
    return;
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  // TODO: validate token with Supabase and set req.userId / req.workspaceSlug
  // For now accept any non-empty token in development
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.userId = "user-from-token";
  req.workspaceSlug = (req.headers["x-workspace-slug"] as string) || "default";
  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      workspaceSlug?: string;
    }
  }
}
