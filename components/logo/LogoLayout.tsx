"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORTED_FONTS, type SupportedFont } from "@/lib/logo/font-list";
import { FONT_CSS } from "@/lib/logo/webfonts";
import {
  composeWordmark,
  DEFAULT_WORDMARK,
  type LockupLayout,
} from "@/lib/logo/wordmark";

/**
 * Layout & type — where an IMPORTED logo goes.
 *
 * The bug this replaces: uploading your own logo vectorized it, landed the
 * project on `final_asset_id`, and then rendered LogoRefine — the screen whose
 * buttons generate NEW logos from it. A business that just brought its own
 * mark was being offered six alternatives to the thing it already owns.
 *
 * What it actually needs is arrangement and typography, and both have to be
 * live: picking a font is a decision you make by LOOKING, so it must redraw on
 * click, not after a round-trip. Everything here is a client-side SVG
 * transform — no fal, no credits, same as the free colour editor.
 */

const LAYOUTS: { id: LockupLayout; label: string; hint: string }[] = [
  { id: "stacked", label: "Stacked", hint: "Mark above the name" },
  { id: "horizontal", label: "Beside", hint: "Mark left of the name" },
  { id: "mark-only", label: "Mark only", hint: "No wordmark" },
  { id: "text-only", label: "Name only", hint: "Wordmark without the mark" },
];

interface Props {
  projectId: string;
  /** The imported/finalised mark. */
  sourceUrl: string;
  /** Prefills the wordmark so the user starts with their own name, not "Brand". */
  initialName?: string;
  brandPalette?: string[];
  onSaved?: (url: string) => void;
  /** Escape hatch to the AI path — offered, never forced. */
  onGenerateInstead?: () => void;
}

export function LogoLayout({
  projectId,
  sourceUrl,
  initialName = "",
  brandPalette = [],
  onSaved,
  onGenerateInstead,
}: Props) {
  const [markSvg, setMarkSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState(initialName);
  const [font, setFont] = useState<SupportedFont>(DEFAULT_WORDMARK.font);
  const [layout, setLayout] = useState<LockupLayout>(DEFAULT_WORDMARK.layout);
  const [fontSize, setFontSize] = useState(DEFAULT_WORDMARK.fontSize);
  const [letterSpacing, setLetterSpacing] = useState(
    DEFAULT_WORDMARK.letterSpacing,
  );
  const [weight, setWeight] = useState(DEFAULT_WORDMARK.weight);
  const [color, setColor] = useState(DEFAULT_WORDMARK.color);

  // The mark is fetched as TEXT, not referenced by URL: an <image href> would
  // leave the saved lockup pointing at a storage object, so deleting that asset
  // would silently gut every logo built from it. Inlined, the lockup is whole.
  useEffect(() => {
    let alive = true;
    // No setLoading(true) here: it starts true, and re-raising it inside the
    // effect body is a cascading render the lint rule is right about. A later
    // sourceUrl change therefore keeps showing the previous mark until the new
    // one lands, which is a cross-fade rather than a spinner flash.
    fetch(sourceUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch"))))
      .then((body) => {
        if (!alive) return;
        // A raster import that never became SVG still deserves the type
        // controls, so a non-SVG body degrades to a text-only lockup rather
        // than an error screen.
        setMarkSvg(body.includes("<svg") ? body : null);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setMarkSvg(null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sourceUrl]);

  const spec = useMemo(
    () => ({
      markSvg,
      text,
      font,
      fontSize,
      letterSpacing,
      weight,
      color,
      layout,
      gap: DEFAULT_WORDMARK.gap,
    }),
    [markSvg, text, font, fontSize, letterSpacing, weight, color, layout],
  );

  // Two renders of the same lockup: the preview resolves next/font's scoped
  // family so it draws live, the saved file names the real family so every
  // downstream renderer resolves it. See lib/logo/wordmark.ts.
  const previewSvg = useMemo(
    () => composeWordmark({ ...spec, previewFontFamily: FONT_CSS[font] }),
    [spec, font],
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/logo/${projectId}/save-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          svg: composeWordmark(spec),
          label: `Lockup — ${font}`,
        }),
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
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your logo…
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_340px]">
      {/* ── Canvas ── */}
      <div className="space-y-4">
        <div
          className="flex min-h-[280px] items-center justify-center rounded-xl border bg-white p-8"
          // Composed by us from a sanitised source; sanitised again server-side
          // on save (app/api/logo/[id]/save-edit).
          dangerouslySetInnerHTML={{ __html: previewSvg }}
        />
        {/* The same check the colour editor makes: a lockup that dies at
            favicon size is a lockup you find out about too late. */}
        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
          <span>Small-size check:</span>
          <span
            className="inline-block w-[120px]"
            dangerouslySetInnerHTML={{ __html: previewSvg }}
          />
          <span
            className="inline-block w-[64px]"
            dangerouslySetInnerHTML={{ __html: previewSvg }}
          />
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="space-y-6">
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <section className="space-y-2">
          <label
            htmlFor="lockup-name"
            className="text-sm font-medium text-foreground"
          >
            Business name
          </label>
          <input
            id="lockup-name"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your business name"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Font</h3>
          {/* Each button previews ITS OWN face — picking a font by reading its
              name in a different typeface is guesswork. */}
          <div className="grid gap-1.5">
            {SUPPORTED_FONTS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFont(f)}
                style={{ fontFamily: FONT_CSS[f] }}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-base transition-colors ${
                  font === f
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <span>{text.trim() || f}</span>
                <span className="ml-3 shrink-0 font-sans text-[10px] uppercase tracking-wider text-muted-foreground">
                  {f}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Arrangement</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLayout(l.id)}
                title={l.hint}
                disabled={!markSvg && l.id !== "text-only"}
                className={`rounded-lg border px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                  layout === l.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          {!markSvg && (
            <p className="text-xs text-muted-foreground">
              This logo isn&apos;t vector, so only the wordmark can be laid out
              here.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">Type</h3>
          <Slider
            label="Size"
            value={fontSize}
            min={8}
            max={40}
            step={1}
            onChange={setFontSize}
          />
          <Slider
            label="Letter spacing"
            value={letterSpacing}
            min={-2}
            max={12}
            step={0.5}
            onChange={setLetterSpacing}
          />
          <div className="flex items-center gap-2">
            <span className="w-28 text-xs text-muted-foreground">Weight</span>
            <div className="flex gap-1.5">
              {[400, 700].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeight(w)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    weight === w
                      ? "border-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {w === 400 ? "Regular" : "Bold"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 text-xs text-muted-foreground">Colour</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Wordmark colour"
              className="h-8 w-8 cursor-pointer rounded border"
            />
            {brandPalette.slice(0, 4).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={`Brand ${c}`}
                aria-label={`Use brand colour ${c}`}
                style={{ backgroundColor: c }}
                className="h-6 w-6 rounded-full border border-border"
              />
            ))}
          </div>
        </section>

        <Button className="w-full" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save lockup (free)"}
        </Button>

        {onGenerateInstead && (
          <button
            type="button"
            onClick={onGenerateInstead}
            className="w-full text-center text-xs text-muted-foreground underline hover:text-foreground"
          >
            Or generate new concepts from this mark (costs credits)
          </button>
        )}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--primary)]"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  );
}
