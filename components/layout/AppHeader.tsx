"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import CreditMeter from "@/components/shared/CreditMeter";
import { TipsToggle } from "@/components/ui/info-hint";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";

interface AppHeaderProps {
  workspaceSlug: string;
  /** Optional back link shown before the logo. */
  backHref?: string;
  backLabel?: string;
  /**
   * The campaign this page is working on, if any.
   *
   * Going "home" from a standalone page is a full navigation, so Studio
   * remounts and loses its React state — which meant landing on an empty Brief
   * screen as though starting a brand-new project, with the real one abandoned
   * mid-flow. Studio already knows how to rehydrate from `?openProject=` (it's
   * how the Compositor's "Continue to publish" works); these links simply
   * weren't using it.
   */
  campaignId?: string | null;
}

/**
 * The shared PrettyMuch shell header for standalone pages (Logo Studio, compositor,
 * etc.) that don't render the full wizard TopBar. Keeps the brand + the live
 * credit meter present everywhere, so users always know they're on PrettyMuch and
 * can always see what they have left. Loads the balance itself since these pages
 * don't go through DashboardClient.
 */
export function AppHeader({
  workspaceSlug,
  backHref,
  backLabel,
  campaignId,
}: AppHeaderProps) {
  // Carry the current project home so Studio resumes it instead of starting over.
  const homeHref = campaignId
    ? `/${workspaceSlug}?openProject=${campaignId}`
    : `/${workspaceSlug}`;
  const setWorkspaceSlug = useAppStore((s) => s.setWorkspaceSlug);
  const setCreditBalance = useAppStore((s) => s.setCreditBalance);

  useEffect(() => {
    if (workspaceSlug) setWorkspaceSlug(workspaceSlug);
    api("/api/credits/balance", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { balance?: number } | null) => {
        if (typeof d?.balance === "number") setCreditBalance(d.balance);
      })
      .catch(() => {});
  }, [workspaceSlug, setWorkspaceSlug, setCreditBalance]);

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-2.5">
      <div className="flex items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {backLabel ?? "Back"}
          </Link>
        ) : null}
        <Link
          href={homeHref}
          className="flex items-center"
          aria-label="PrettyMuch home"
        >
          <Logo size={22} withWordmark />
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <TipsToggle />
        <CreditMeter />
      </div>
    </header>
  );
}
