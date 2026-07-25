import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOrProvisionWorkspace } from "@/lib/auth/provisioning";

// Runs before EVERY /[workspace]/* route (including nested ones like
// compositor, logo, productions, settings/*) — closes a gap where each of
// those pages/layouts only checked "are you logged in", never "are you a
// member of THIS workspace". Any authenticated user could otherwise load
// any workspace slug and the page would render (individual API calls would
// separately 403 via getSession(), but nothing gated the page itself).
// A layout works here even for routes whose page.tsx is a Client Component
// (e.g. compositor/page.tsx) — Next.js renders this ancestor server-side
// and can redirect before the client page ever mounts.
export const dynamic = "force-dynamic";

interface Props {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}

export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspace } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createSupabaseAdminClient();
  const { data: membership } = await admin
    .from("workspace_members")
    .select("workspace_id, workspaces!inner(slug)")
    .eq("user_id", user.id)
    .eq("workspaces.slug", workspace)
    .maybeSingle();

  if (!membership) {
    const own = await getOrProvisionWorkspace({
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name as string | undefined,
    });
    redirect(`/${own.slug}`);
  }

  return <>{children}</>;
}
