import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { db } from '@/db';
import { workspaceMembers, workspaces } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export interface Session {
  userId: string;
  workspaceId: string;
  role: string;
  workspaceSlug: string;
}

export async function getSession(req: Request): Promise<Session> {
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let userId: string;

  if (bearerToken) {
    // Replit (or any external) frontend — verify JWT directly
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (error || !data.user) throw new Error('Unauthorized');
    userId = data.user.id;
  } else {
    // Next.js SSR pages — cookie-based session
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Unauthorized');
    userId = data.user.id;
  }

  const url = new URL(req.url);
  const workspaceSlug =
    url.searchParams.get('workspace') ?? req.headers.get('x-workspace-slug');

  if (!workspaceSlug) throw new Error('Workspace not specified');

  const membership = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      slug: workspaces.slug,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(eq(workspaceMembers.userId, userId), eq(workspaces.slug, workspaceSlug)),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!membership) throw new Error('Not a workspace member');

  return {
    userId,
    workspaceId: membership.workspaceId,
    role: membership.role,
    workspaceSlug: membership.slug,
  };
}
