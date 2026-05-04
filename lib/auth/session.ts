import { createSupabaseServerClient } from '@/lib/supabase/server';
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error('Unauthorized');

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
      and(eq(workspaceMembers.userId, user.id), eq(workspaces.slug, workspaceSlug)),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (!membership) throw new Error('Not a workspace member');

  return {
    userId: user.id,
    workspaceId: membership.workspaceId,
    role: membership.role,
    workspaceSlug: membership.slug,
  };
}
