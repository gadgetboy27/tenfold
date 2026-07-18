"use client";

// Step 2: the 6 concept SVGs. Click one to anchor it (the campaign
// anchor-selection UX, reused). While fewer than the expected count have
// landed, empty slots show a shimmer so the grid doesn't jump as webhooks
// arrive one by one.

export interface LogoAsset {
  id: string;
  url: string;
}

interface LogoConceptGridProps {
  concepts: LogoAsset[];
  expected: number;
  anchorId: string | null;
  onAnchor: (assetId: string) => void;
  anchoring: boolean;
}

export function LogoConceptGrid({
  concepts,
  expected,
  anchorId,
  onAnchor,
  anchoring,
}: LogoConceptGridProps) {
  const pending = Math.max(0, expected - concepts.length);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Pick your favourite</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {concepts.length < expected
            ? `Generating… ${concepts.length} of ${expected} ready`
            : "Tap a concept to refine it into your final logo."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {concepts.map((c) => {
          const selected = c.id === anchorId;
          return (
            <button
              key={c.id}
              type="button"
              disabled={anchoring}
              onClick={() => onAnchor(c.id)}
              className={`group relative aspect-square overflow-hidden rounded-xl border-2 bg-white transition ${
                selected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.url}
                alt="Logo concept"
                className="h-full w-full object-contain p-4"
              />
              {selected && (
                <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  Selected
                </span>
              )}
            </button>
          );
        })}
        {Array.from({ length: pending }).map((_, i) => (
          <div
            key={`pending-${i}`}
            className="aspect-square animate-pulse rounded-xl border-2 border-dashed border-border bg-muted"
          />
        ))}
      </div>
    </div>
  );
}
