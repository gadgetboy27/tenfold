import { Studio } from "@/components/studio/Studio";
import { isEnabled } from "@/lib/flags";

// Studio is the main site — the progressive canvas (Cockpit) is what every
// user lands on. The classic step-by-step dashboard has been retired from
// this route and deleted from the repo (see components/studio/CLAUDE.md).
// Auth + workspace-membership are enforced by the parent layout.tsx, not here.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default async function WorkspacePage({ params }: Props) {
  const { workspace } = await params;
  return (
    <Studio workspaceSlug={workspace} logoEnabled={isEnabled("logoBuilder")} />
  );
}
