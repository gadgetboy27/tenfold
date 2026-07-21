import { Studio } from "@/components/studio/Studio";
import { isEnabled } from "@/lib/flags";

// Hidden preview of the progressive-canvas redesign. Reachable only by typing
// /<workspace>/studio — it's additive and isolated, so the classic app is
// untouched. It drives the same endpoints as the existing flow.
export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  // Server-authoritative flag, read here and passed down — the Logo & Brand
  // section renders the full studio inline only when the builder is enabled.
  return (
    <Studio workspaceSlug={workspace} logoEnabled={isEnabled("logoBuilder")} />
  );
}
