"use client";

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import {
  GalleryPicker,
  GalleryPickButton,
} from "@/components/shared/GalleryPicker";

/**
 * The picture a Series is built around — the product, the person, the place.
 * Their own upload, something already in the gallery, or the project's current
 * image. Uploads go through the same endpoint every other tool uses.
 */
export function SeriesSubject({
  url,
  workspaceSlug,
  campaignId,
  workingImage,
  disabled,
  onChange,
}: {
  url: string;
  workspaceSlug: string;
  campaignId: string | null;
  /** The project's current image, offered as a one-click subject. */
  workingImage: string | null;
  disabled?: boolean;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api("/api/uploads/image", {
        method: "POST",
        body: fd,
        workspaceSlug,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      onChange(data.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        The subject
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-background">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Subject"
              className="h-full w-full object-cover"
            />
          ) : uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <span className="px-2 text-center text-[11px] text-muted-foreground">
              Pick the photo every scene is built around
            </span>
          )}
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-center text-xs text-muted-foreground transition-colors hover:text-foreground">
            <Upload className="mr-1 inline h-3.5 w-3.5" />
            Upload a photo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={disabled || uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
          <GalleryPickButton
            onClick={() => setPicking(true)}
            disabled={disabled}
            className="justify-center"
          />
          {workingImage && workingImage !== url && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(workingImage)}
              className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              Use this project&apos;s image
            </button>
          )}
        </div>
      </div>
      <GalleryPicker
        open={picking}
        onClose={() => setPicking(false)}
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
        title="Pick the subject"
        hint="A clear, well-lit photo of the one thing (or person) you want in every scene."
        onPick={(a) => {
          onChange(a.url);
          setPicking(false);
        }}
      />
    </div>
  );
}
