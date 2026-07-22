"use client";

import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";

/**
 * Bring-your-own product photo. Uploads via the parent's handler and shows a
 * thumbnail once set; when a reference is present, generation is image-
 * conditioned (FLUX Kontext) so the anchors feature the uploaded subject.
 */
export function ReferencePhotoField({
  url,
  uploading,
  onUpload,
  onClear,
  compact,
}: {
  url: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
  /** Tighter styling for the cockpit's narrow left panel. */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        Reference photo{" "}
        <span className="text-muted-foreground/60">· optional</span>
      </label>

      {url ? (
        <div className="relative overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Reference"
            className={`w-full object-cover ${compact ? "h-24" : "h-32"}`}
          />
          <button
            type="button"
            onClick={onClear}
            aria-label="Remove reference photo"
            className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
            Your ads will feature this
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onUpload(f);
          }}
          className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 text-center transition-colors ${
            compact ? "py-4" : "py-6"
          } ${
            dragOver
              ? "border-primary/60 bg-primary/5"
              : "border-border bg-background/50 hover:border-primary/40"
          }`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {uploading
              ? "Uploading…"
              : "Drop a product photo, or click to upload"}
          </span>
          {!compact && (
            <span className="text-[10px] text-muted-foreground/60">
              We&apos;ll generate ads featuring it · PNG/JPG/WEBP, under 10 MB
            </span>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
