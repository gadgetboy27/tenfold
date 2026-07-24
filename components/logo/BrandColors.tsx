"use client";

import { useEffect, useState } from "react";
import { Palette, Loader2, Check } from "lucide-react";
import { ColorField } from "@/components/ui/color-field";

const DEFAULTS = {
  primary_color: "#6366f1",
  secondary_color: "#8b5cf6",
  accent_color: "#f59e0b",
};

/**
 * Brand colours, editable right here instead of only on the separate Brand
 * Kit settings page — the same 3 fields (primary/secondary/accent) that
 * LogoBrief's "Brand colours" direction and LogoEditor's "Apply brand
 * palette" button already read from GET /api/brand-kit. `onSaved` lets
 * LogoStudio refresh its own cached palette without a full re-fetch.
 */
export function BrandColors({
  onSaved,
}: {
  onSaved?: (palette: string[]) => void;
}) {
  const [colors, setColors] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/brand-kit")
      .then((r) => (r.ok ? r.json() : null))
      .then((kit: Partial<typeof DEFAULTS> | null) => {
        if (!kit) return;
        setColors({
          primary_color: kit.primary_color ?? DEFAULTS.primary_color,
          secondary_color: kit.secondary_color ?? DEFAULTS.secondary_color,
          accent_color: kit.accent_color ?? DEFAULTS.accent_color,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/brand-kit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(colors),
      });
      if (res.ok) {
        setSaved(true);
        onSaved?.([
          colors.primary_color,
          colors.secondary_color,
          colors.accent_color,
        ]);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="mx-auto mt-8 max-w-xl rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Palette className="h-4 w-4 text-muted-foreground" /> Brand colours
      </h3>
      <div className="space-y-3">
        <ColorField
          label="Primary"
          value={colors.primary_color}
          onChange={(v) => setColors((c) => ({ ...c, primary_color: v }))}
        />
        <ColorField
          label="Secondary"
          value={colors.secondary_color}
          onChange={(v) => setColors((c) => ({ ...c, secondary_color: v }))}
        />
        <ColorField
          label="Accent"
          value={colors.accent_color}
          onChange={(v) => setColors((c) => ({ ...c, accent_color: v }))}
        />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <Check className="h-4 w-4" />
        ) : null}
        {saving ? "Saving…" : saved ? "Saved" : "Save brand colours"}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Used for &quot;Brand colours&quot; when generating a logo, and
        &quot;Apply brand palette&quot; in the editor.
      </p>
    </div>
  );
}
