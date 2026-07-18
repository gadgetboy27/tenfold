"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LogoAsset } from "./LogoConceptGrid";

// Step 3: the chosen concept, large. "More like this" runs an image-to-image
// refine (1 credit) over the anchor; each refine appends a new variant the user
// can re-anchor to. Finalize re-generates at Pro quality (3 credits) and is the
// deliverable. The most recent refined variant (if any) shows beside the anchor.

interface LogoRefineProps {
  anchor: LogoAsset;
  refined: LogoAsset[];
  finalized: LogoAsset | null;
  onRefine: (instruction: string) => void;
  onFinalize: () => void;
  onReanchor: (assetId: string) => void;
  onEdit: () => void;
  onPackage: () => void;
  packaging: boolean;
  bundle: { downloadUrl: string; fileCount: number } | null;
  onMockups: () => void;
  mockups: LogoAsset[];
  expectedMockups: number;
  busy: boolean;
}

export function LogoRefine({
  anchor,
  refined,
  finalized,
  onRefine,
  onFinalize,
  onReanchor,
  onEdit,
  onPackage,
  packaging,
  bundle,
  onMockups,
  mockups,
  expectedMockups,
  busy,
}: LogoRefineProps) {
  const [instruction, setInstruction] = useState("");

  if (finalized) {
    return (
      <div className="mx-auto max-w-xl space-y-6 text-center">
        <h2 className="text-xl font-semibold">Your logo is ready</h2>
        <div className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={finalized.url}
            alt="Final logo"
            className="h-full w-full object-contain p-6"
          />
        </div>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={onEdit}>
            Customise (free)
          </Button>
          <Button asChild variant="outline">
            <a href={finalized.url} download>
              Download SVG
            </a>
          </Button>
        </div>

        <div className="border-t pt-6">
          {bundle ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Brand package ready — {bundle.fileCount} files, and your palette
                was saved to your brand kit.
              </p>
              <Button asChild>
                <a href={bundle.downloadUrl} download>
                  Download brand package (.zip)
                </a>
              </Button>
            </div>
          ) : (
            <Button className="w-full" disabled={packaging} onClick={onPackage}>
              {packaging
                ? "Building your package…"
                : "Get the full brand package (10 credits)"}
            </Button>
          )}
        </div>

        <div className="space-y-3 border-t pt-6">
          {mockups.length === 0 && expectedMockups === 0 ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={onMockups}
            >
              See it in the real world — 4 mockups (2 credits)
            </Button>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {mockups.length < expectedMockups
                  ? `Creating mockups… ${mockups.length} of ${expectedMockups}`
                  : "Your logo in the wild"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {mockups.map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m.id}
                    src={m.url}
                    alt="Logo mockup"
                    className="aspect-square w-full rounded-lg border object-cover"
                  />
                ))}
                {Array.from({
                  length: Math.max(0, expectedMockups - mockups.length),
                }).map((_, i) => (
                  <div
                    key={`m-pending-${i}`}
                    className="aspect-square w-full animate-pulse rounded-lg border border-dashed bg-muted"
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Refine your logo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask for tweaks, or finalise as-is at premium quality.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Selected</p>
          <div className="aspect-square overflow-hidden rounded-xl border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={anchor.url}
              alt="Selected concept"
              className="h-full w-full object-contain p-4"
            />
          </div>
        </div>
        {refined.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Latest refinement
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReanchor(refined[refined.length - 1].id)}
              className="aspect-square w-full overflow-hidden rounded-xl border-2 border-border bg-white transition hover:border-primary/50"
              title="Use this as the new starting point"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={refined[refined.length - 1].url}
                alt="Refined logo"
                className="h-full w-full object-contain p-4"
              />
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Make it bolder, add more spacing…"
          maxLength={300}
          disabled={busy}
        />
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => onRefine(instruction.trim())}
        >
          {busy ? "Working…" : "More like this (1 cr)"}
        </Button>
      </div>

      <div className="border-t pt-6">
        <Button className="w-full" disabled={busy} onClick={onFinalize}>
          Finalise logo (3 credits)
        </Button>
      </div>
    </div>
  );
}
