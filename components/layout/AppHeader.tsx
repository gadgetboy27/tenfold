"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import CreditMeter from "@/components/shared/CreditMeter";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";

interface AppHeaderProps {
  workspaceSlug: string;
  /** Optional back link shown before the logo. */
  backHref?: string;
  backLabel?: string;
}

/**
 * The shared Tenfold shell header for standalone pages (Logo Studio, compositor,
 * etc.) that don't render the full wizard TopBar. Keeps the brand + the live
 * credit meter present everywhere, so users always know they're on Tenfold and
 * can always see what they have left. Loads the balance itself since these pages
 * don't go through DashboardClient.
 */
export function AppHeader({
  workspaceSlug,
  backHref,
  backLabel,
}: AppHeaderProps) {
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
          href={`/${workspaceSlug}`}
          className="flex items-center"
          aria-label="Tenfold home"
        >
          <Logo size={22} withWordmark />
        </Link>
      </div>
      <CreditMeter />
    </header>
  );
}
