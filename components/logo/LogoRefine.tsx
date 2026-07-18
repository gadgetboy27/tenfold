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
  busy: boolean;
}

export function LogoRefine({
  anchor,
  refined,
  finalized,
  onRefine,
  onFinalize,
  onReanchor,
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
        <Button asChild>
          <a href={finalized.url} download>
            Download SVG
          </a>
        </Button>
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
