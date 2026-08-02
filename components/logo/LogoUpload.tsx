"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { GalleryPickButton } from "@/components/shared/GalleryPicker";
import { CREDIT_COSTS } from "@/lib/credits/costs";

/**
 * Acquisition entry point (Step 1 alternative): a business with an older
 * saved logo can bring it in and get it vectorized into a clean, editable SVG
 * (Recraft) instead of generating a brand-new one. Posts straight to
 * POST /api/logo/vectorize — LogoStudio treats the resulting project exactly
 * like a generated-and-finalized one (see the anchor/final fallback there).
 */
export function LogoUpload({
  onUpload,
  onPickFromGallery,
  uploading,
}: {
  onUpload: (file: File) => void;
  onPickFromGallery: () => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="mx-auto mt-8 max-w-xl">
      <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>
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
        disabled={uploading}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          dragOver
            ? "border-primary/60 bg-primary/5"
            : "border-border hover:border-primary/40"
        }`}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <Upload className="h-5 w-5 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">
          {uploading
            ? "Vectorizing your logo…"
            : "Have an existing logo? Upload it"}
        </span>
        <span className="text-xs text-muted-foreground">
          We&apos;ll turn it into a clean, editable SVG — PNG/JPG/WEBP, under 5
          MB · {CREDIT_COSTS.logo_vectorize} credit
        </span>
      </button>
      {/* Or vectorize something already in the workspace — a mark generated
          in an earlier session doesn't need re-downloading and re-uploading. */}
      <GalleryPickButton
        onClick={onPickFromGallery}
        label="Or vectorize an image from your gallery"
        disabled={uploading}
        className="mt-2 w-full justify-center"
      />
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
