"use client";

import { Input } from "@/components/ui/input";

/** Native colour swatch + synced hex text field. Shared by the Brand Kit
 *  settings page and Logo Studio's inline brand-colours card. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
          title={label}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <Input
          value={value}
          onChange={(e) =>
            /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) &&
            onChange(e.target.value)
          }
          className="h-8 font-mono text-xs bg-background"
          maxLength={7}
        />
      </div>
    </div>
  );
}
