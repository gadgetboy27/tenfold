"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import type { SceneResult } from "@/lib/series/progress";

/** One tile per scene: waiting, done (click to open) or failed (and refunded). */
export function SeriesResults({ results }: { results: SceneResult[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {results.map((r) => (
        <div
          key={`${r.sceneIndex}-${r.jobId ?? "x"}`}
          className="overflow-hidden rounded-lg border border-border bg-background"
        >
          <div className="grid aspect-square place-items-center bg-secondary/40">
            {r.status === "ready" && r.url ? (
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="block h-full w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.url}
                  alt={r.scene}
                  className="h-full w-full object-cover"
                />
              </a>
            ) : r.status === "failed" ? (
              <span className="flex flex-col items-center gap-1 px-3 text-center text-[11px] text-destructive">
                <AlertCircle className="h-4 w-4" />
                {r.error}
              </span>
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="line-clamp-2 px-2 py-1.5 text-[11px] text-muted-foreground">
            {r.scene}
          </p>
        </div>
      ))}
    </div>
  );
}
