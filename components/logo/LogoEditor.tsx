"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  extractFills,
  backgroundFill,
  recolor,
  setBackground,
  applyBrandPalette,
  hexToRgb,
  type BackgroundMode,
} from "@/lib/logo/svg";

// Phase 2: the free editor. All edits are SVG-string transforms in the browser
// (no fal, no credits); "Save" persists the current state as a new version.
// History is an in-memory stack for undo/redo.

interface LogoEditorProps {
  projectId: string;
  sourceUrl: string;
  brandPalette?: string[];
  onSaved?: (url: string) => void;
}

const BG_MODES: { mode: BackgroundMode; label: string }[] = [
  { mode: "transparent", label: "Transparent" },
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
  { mode: "brand", label: "Brand" },
];

export function LogoEditor({
  projectId,
  sourceUrl,
  brandPalette = [],
  onSaved,
}: LogoEditorProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const svg = history[cursor] ?? "";

  useEffect(() => {
    let alive = true;
    fetch(sourceUrl)
      .then((r) => r.text())
      .then((text) => {
        if (!alive) return;
        setHistory([text]);
        setCursor(0);
        setLoading(false);
      })
      .catch(() => alive && setError("Could not load the logo"));
    return () => {
      alive = false;
    };
  }, [sourceUrl]);

  // A new edit truncates any redo tail, then appends.
  function push(next: string) {
    if (next === svg) return;
    setHistory((h) => [...h.slice(0, cursor + 1), next]);
    setCursor((c) => c + 1);
  }

  const bg = useMemo(() => backgroundFill(svg), [svg]);
  const fills = useMemo(
    () => extractFills(svg).filter((f) => f.value !== bg),
    [svg, bg],
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/logo/${projectId}/save-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved?.(data.asset.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 lg:grid-cols-[1fr_320px]">
      {/* Canvas */}
      <div className="space-y-4">
        <div
          className="mx-auto flex aspect-square w-full max-w-md items-center justify-center overflow-hidden rounded-xl border"
          style={{
            backgroundImage:
              bg === "none" || bg === null
                ? "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%)"
                : undefined,
            backgroundSize: "20px 20px",
          }}
          // Recraft SVG we generated; sanitised again server-side on save.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {/* Minimum-size legibility preview */}
        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <span>Small-size check:</span>
          <span
            className="inline-block"
            style={{ width: 32, height: 32 }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <span
            className="inline-block"
            style={{ width: 16, height: 16 }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          {fills.length > 3 && (
            <span className="text-amber-600">Busy — may not read at 16px</span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-6">
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Colours</h3>
          <div className="flex flex-wrap gap-3">
            {fills.map((f) => (
              <label key={f.value} className="flex flex-col items-center gap-1">
                <input
                  type="color"
                  value={f.hex}
                  onChange={(e) =>
                    push(recolor(svg, { [f.value]: hexToRgb(e.target.value) }))
                  }
                  className="h-9 w-9 cursor-pointer rounded border"
                  aria-label={`Recolour ${f.hex}`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {f.hex}
                </span>
              </label>
            ))}
          </div>
          {brandPalette.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => push(applyBrandPalette(svg, brandPalette))}
            >
              Apply brand palette
            </Button>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Background</h3>
          <div className="flex flex-wrap gap-2">
            {BG_MODES.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                disabled={mode === "brand" && brandPalette.length === 0}
                onClick={() => push(setBackground(svg, mode, brandPalette[0]))}
                className="rounded-full border px-3 py-1 text-xs transition hover:bg-muted disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={cursor === 0}
            onClick={() => setCursor((c) => c - 1)}
          >
            Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={cursor >= history.length - 1}
            onClick={() => setCursor((c) => c + 1)}
          >
            Redo
          </Button>
        </section>

        <Button className="w-full" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save version (free)"}
        </Button>
      </div>
    </div>
  );
}
