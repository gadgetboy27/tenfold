import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/flags";
import { LogoStudio } from "@/components/logo/LogoStudio";
import { AppHeader } from "@/components/layout/AppHeader";

// Request-time only: the flag gate reads server env, and LogoStudio reads
// searchParams (returnTo) — both require dynamic rendering, not prerender.
export const dynamic = "force-dynamic";

/**
 * The logo builder's route — a SERVER component so the flag gate runs before
 * anything renders. When FEATURE_LOGO_BUILDER isn't "1" this route is a genuine
 * 404: the feature doesn't exist to a user, even though the code is deployed.
 *
 * The gate lives here, not in the client component, because a client component
 * can't read server env. The server page decides; the client UI (LogoBuilder)
 * just does the work once it's allowed to render.
 */
export default async function LogoBuilderPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  if (!isEnabled("logoBuilder")) notFound();
  const { workspace } = await params;
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader
        workspaceSlug={workspace}
        backHref={`/${workspace}`}
        backLabel="Dashboard"
      />
      <div className="flex-1 overflow-y-auto">
        <LogoStudio />
      </div>
    </div>
  );
}
