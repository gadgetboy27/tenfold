import { notFound } from "next/navigation";
import { isEnabled } from "@/lib/flags";
import { LogoBuilder } from "@/components/logo/LogoBuilder";

/**
 * The logo builder's route — a SERVER component so the flag gate runs before
 * anything renders. When FEATURE_LOGO_BUILDER isn't "1" this route is a genuine
 * 404: the feature doesn't exist to a user, even though the code is deployed.
 *
 * The gate lives here, not in the client component, because a client component
 * can't read server env. The server page decides; the client UI (LogoBuilder)
 * just does the work once it's allowed to render.
 */
export default function LogoBuilderPage() {
  if (!isEnabled("logoBuilder")) notFound();
  return <LogoBuilder />;
}
