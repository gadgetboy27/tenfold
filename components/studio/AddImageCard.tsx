"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import {
  GalleryPicker,
  GalleryPickButton,
} from "@/components/shared/GalleryPicker";
import { generateSingleImage } from "@/lib/studio/generate-image";
import { addImageToAd } from "./adBridge";

/**
 * Put a picture on the ad from inside the Wording tool — a logo, a product
 * cut-out, a badge — without leaving for the Images or Compose tabs.
 *
 * Three ways in, one outcome: upload a file, reach back into the gallery, or
 * describe something small and generate it. All three land through
 * `addImageToAd`, so they behave exactly like every other image placed on the
 * ad (first one becomes the backdrop, later ones stack as layers you can drag).
 *
 * Generate is the ONLY paid path here and is priced from CREDIT_COSTS, never
 * a literal — it's the same single-image job the rail's Create step runs.
 */
export function AddImageCard({
  workspaceSlug,
  campaignId,
  onSpent,
}: {
  workspaceSlug: string;
  /** Needed to generate — a job has to belong to a campaign. Upload and
   *  gallery work without one. */
  campaignId: string | null;
  /** Called after credits are spent so the meter can catch up. */
  onSpent?: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"upload" | "generate" | null>(null);
  const [picking, setPicking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cost = CREDIT_COSTS.image_generation;

  const placed = (src: string) => {
    const where = addImageToAd(src);
    toast.success(
      where === "background"
        ? "Added as your ad's backdrop"
        : "Added — drag it where you want it",
    );
  };

  const upload = async (file: File) => {
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api("/api/uploads/image", {
        method: "POST",
        body: fd,
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      placed(data.url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const generate = async () => {
    if (!campaignId || !prompt.trim() || busy) return;
    setBusy("generate");
    try {
      const url = await generateSingleImage({
        workspaceSlug,
        campaignId,
        prompt: prompt.trim(),
        cost,
        onAccepted: onSpent,
      });
      placed(url);
      setPrompt("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
      onSpent?.();
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ImagePlus className="h-4 w-4" /> Add an image
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A logo, a product, a badge — bring one in or make a small one.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40"
        >
          {busy === "upload" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          Upload
        </button>
        <GalleryPickButton
          onClick={() => setPicking(true)}
          disabled={busy !== null}
        />
      </div>

      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void generate();
          }}
          maxLength={200}
          placeholder={
            campaignId
              ? "e.g. a gold foil starburst badge"
              : "Generate an image first to enable this"
          }
          disabled={!campaignId || busy !== null}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary/60 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={!campaignId || !prompt.trim() || busy !== null}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "generate" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Generate · {cost}
        </button>
      </div>

      <GalleryPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(a) => {
          setPicking(false);
          placed(a.url);
        }}
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
        title="Pick an image to add"
      />
    </div>
  );
}
