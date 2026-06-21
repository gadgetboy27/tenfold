"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Share2, Palette, CreditCard, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "social", label: "Social Connections", icon: Share2 },
  { href: "brand", label: "Brand Kit", icon: Palette },
  { href: "billing", label: "Billing", icon: CreditCard },
];

export default function SettingsNav({ workspace }: { workspace: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const renderLinks = (onClick?: () => void) =>
    NAV.map(({ href, label, icon: Icon }) => {
      const fullHref = `/${workspace}/settings/${href}`;
      const active =
        pathname === fullHref || pathname.startsWith(`${fullHref}/`);
      return (
        <Link
          key={href}
          href={fullHref}
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
            active
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary",
          )}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {label}
        </Link>
      );
    });

  const activeLabel =
    NAV.find(({ href }) =>
      pathname.startsWith(`/${workspace}/settings/${href}`),
    )?.label ?? "Settings";

  return (
    <>
      {/* Desktop: persistent sidebar */}
      <aside className="hidden md:block w-52 shrink-0 border-r border-border bg-card p-4 space-y-1">
        {renderLinks()}
      </aside>

      {/* Mobile: collapsible hamburger nav (lets the content go full-width) */}
      <div className="md:hidden border-b border-border bg-card">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-foreground"
          aria-expanded={open}
        >
          {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          {open ? "Close menu" : activeLabel}
        </button>
        {open && (
          <nav className="space-y-1 px-3 pb-3">
            {renderLinks(() => setOpen(false))}
          </nav>
        )}
      </div>
    </>
  );
}
