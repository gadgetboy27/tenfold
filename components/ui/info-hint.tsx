"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

/**
 * Inline help icon. Renders nothing when tooltips are globally disabled, so
 * sprinkling these next to options is free — the user can turn them all off with
 * <TipsToggle/>. Tooltip shows on hover, focus, or tap.
 */
export function InfoHint({ text }: { text: string }) {
  const enabled = useAppStore((s) => s.tooltipsEnabled);
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <span className="relative inline-flex items-center align-middle">
      <button
        type="button"
        aria-label="Help"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="text-muted-foreground/50 hover:text-primary transition-colors"
      >
        <Info className="w-3 h-3" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-1 w-52 -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/** Global on/off switch for all InfoHints. */
export function TipsToggle() {
  const enabled = useAppStore((s) => s.tooltipsEnabled);
  const setEnabled = useAppStore((s) => s.setTooltipsEnabled);

  // Restore the saved preference after mount. The store default is `true`, so
  // SSR and the first client render match (no hydration mismatch); this syncs
  // the persisted choice a tick later.
  useEffect(() => {
    if (window.localStorage.getItem("tf_tooltips") === "off") {
      setEnabled(false);
    }
  }, [setEnabled]);

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1 transition-colors",
        enabled
          ? "border-primary/40 text-primary bg-primary/10"
          : "border-border text-muted-foreground hover:border-primary/40",
      )}
    >
      <Info className="w-3.5 h-3.5" />
      Tips {enabled ? "on" : "off"}
    </button>
  );
}
