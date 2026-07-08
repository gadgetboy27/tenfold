"use client";

import { useRef } from "react";
import { Clapperboard, Film, ImageIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Compositor } from "@/components/compositor/Compositor";
import { useCompositorStore } from "@/store/useCompositorStore";

/**
 * Compositor lab — a place to exercise the layered compositor with local files
 * before it's wired into the campaign flow (brief Prompt 5). Nothing here is
 * uploaded or saved: backgrounds and layers use object URLs, preview only.
 */
export default function CompositorLabPage() {
  const doc = useCompositorStore((s) => s.doc);
  const load = useCompositorStore((s) => s.load);
  const reset = useCompositorStore((s) => s.reset);
  const videoRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const start = (file: File, kind: "video" | "image") => {
    load({
      id: crypto.randomUUID(),
      aspect: "9:16",
      background: {
        kind,
        src: URL.createObjectURL(file),
        ...(kind === "image" ? { durationSec: 10 } : {}),
      },
      layers: [],
    });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Compositor lab</h1>
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
            Beta
          </span>
        </div>
        {doc && (
          <Button
            size="sm"
            variant="outline"
            onClick={reset}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Start over
          </Button>
        )}
      </div>

      {doc ? (
        <div className="min-h-0 flex-1">
          <Compositor />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
            <p className="mb-1 font-semibold">Pick your background footage</p>
            <p className="mb-6 text-sm text-muted-foreground">
              Choose a video or image from this device, then layer your logo and
              captions on top. Preview only — nothing is uploaded.
            </p>
            <div className="flex justify-center gap-3">
              <Button
                onClick={() => videoRef.current?.click()}
                className="gap-2"
              >
                <Film className="h-4 w-4" /> Video
              </Button>
              <Button
                variant="outline"
                onClick={() => imageRef.current?.click()}
                className="gap-2"
              >
                <ImageIcon className="h-4 w-4" /> Image
              </Button>
            </div>
            <input
              ref={videoRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) start(f, "video");
              }}
            />
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) start(f, "image");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
