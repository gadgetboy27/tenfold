"use client";

import { Check, ChevronDown, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface StudioOption<T extends string> {
  value: T;
  label: string;
  /** Optional secondary line shown under the label in the open list. */
  blurb?: string;
  /** Optional trailing tag (e.g. a credit cost or "Pro"). */
  badge?: string;
  /** Locked options render greyed with a lock and can't be picked. */
  locked?: boolean;
}

/**
 * A single-select dropdown picker styled to Studio's tokens — the consistent
 * replacement for rows of pills/segmented buttons across every menu item that
 * offers a fixed range of choices. Built on the Radix DropdownMenu primitive
 * (portal + keyboard a11y). Generic over the value type so callers stay typed.
 */
export function StudioSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  onLockedPick,
  className,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: StudioOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  /** Called when a locked option is clicked — wire to the upgrade modal. */
  onLockedPick?: (value: T) => void;
  className?: string;
}) {
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={`flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm outline-none transition-colors hover:border-primary/40 focus:border-primary/50 disabled:opacity-50 ${className ?? ""}`}
        >
          <span className={selected ? "text-foreground" : "text-muted-foreground"}>
            {selected?.label ?? placeholder}
          </span>
          {selected?.badge && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {selected.badge}
            </span>
          )}
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56"
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={(e) => {
                if (o.locked) {
                  e.preventDefault();
                  onLockedPick?.(o.value);
                  return;
                }
                onChange(o.value);
              }}
              className={`flex-col items-start gap-0.5 ${o.locked ? "opacity-60" : ""}`}
            >
              <div className="flex w-full items-center gap-2">
                {o.locked ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Check
                    className={`h-3.5 w-3.5 shrink-0 ${active ? "opacity-100 text-primary" : "opacity-0"}`}
                  />
                )}
                <span className="font-medium">{o.label}</span>
                {o.badge && (
                  <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {o.badge}
                  </span>
                )}
              </div>
              {o.blurb && (
                <span className="pl-5 text-[11px] leading-snug text-muted-foreground">
                  {o.blurb}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
