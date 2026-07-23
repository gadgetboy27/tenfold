import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  return (
    <Studio workspaceSlug={workspace} logoEnabled={isEnabled("logoBuilder")} />
  );
}
