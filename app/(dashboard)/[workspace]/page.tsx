import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOrProvisionWorkspace } from "@/lib/auth/provisioning";
import { Studio } from "@/components/studio/Studio";
import { isEnabled } from "@/lib/flags";

// Studio is the main site — the progressive canvas (Cockpit) is what every
// user lands on. The classic step-by-step dashboard has been retired from
// this route (still present in the repo, just no longer linked here).
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default async function WorkspacePage({ params }: Props) {
  const { workspace } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // This only checked "are you logged in", never "are you a member of THIS
  // workspace" — any authenticated user could load any workspace slug and
  // Studio would render (individual API calls would separately 403 via
  // getSession(), but the shell itself never checked). Verify membership
  // here and bounce to the user's own workspace if the slug isn't theirs.
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

  return (
    <Studio workspaceSlug={workspace} logoEnabled={isEnabled("logoBuilder")} />
  );
}
