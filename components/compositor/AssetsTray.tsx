"use client";

import { useState } from "react";
import {
  Image as ImageIcon,
  Film,
  Music,
  MessageSquare,
  Download,
  Plus,
  Package,
  FileText,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { downloadCampaignPdf } from "@/lib/compositor/campaign-pdf";
import type { CampaignAssetBundle } from "./Compositor";

interface AssetsTrayProps {
  assets: CampaignAssetBundle;
  /** Drop the anchor image onto the canvas as a movable image layer. */
  onAddImage: (url: string) => void;
  /** Drop the caption onto the canvas as a text layer. */
  onAddText: (text: string) => void;
}

/** Fetch a remote asset and save it as a file (not just open it in a tab). */
async function saveUrl(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    const href = URL.createObjectURL(await res.blob());
    const el = document.createElement("a");
    el.href = href;
    el.download = filename;
    el.click();
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function saveText(text: string, filename: string): void {
  const href = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const el = document.createElement("a");
  el.href = href;
  el.download = filename;
  el.click();
  URL.revokeObjectURL(href);
}

const EXT: Record<string, string> = {
  image: "png",
  video: "mp4",
  audio: "mp3",
};

/**
 * The campaign's assets, gathered so nothing the user paid for is lost. Each is
 * downloadable on its own, the image and caption can be dropped onto the canvas
 * as layers, and "Download all" bundles everything into a zip.
 */
export function AssetsTray({ assets, onAddImage, onAddText }: AssetsTrayProps) {
  const [zipping, setZipping] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { imageUrl, videoUrl, audioUrl, caption } = assets;

  const makePdf = async () => {
    setPdfBusy(true);
    try {
      await downloadCampaignPdf({
        imageUrl,
        caption,
        logoUrl: assets.logoUrl,
        brandName: assets.brandName,
      });
    } catch {
      toast.error("Couldn't build the PDF — try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const rows: {
    key: string;
    label: string;
    icon: typeof ImageIcon;
    url?: string | null;
    text?: string;
    kind: "image" | "video" | "audio" | "caption";
  }[] = [
    {
      key: "image",
      label: "Anchor image",
      icon: ImageIcon,
      url: imageUrl,
      kind: "image",
    },
    { key: "video", label: "Video", icon: Film, url: videoUrl, kind: "video" },
    { key: "audio", label: "Music", icon: Music, url: audioUrl, kind: "audio" },
    {
      key: "caption",
      label: "Caption",
      icon: MessageSquare,
      text: caption,
      kind: "caption",
    },
  ];
  const present = rows.filter((r) => r.url || (r.text && r.text.trim()));

  if (present.length === 0) return null;

  const downloadAll = async () => {
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const r of present) {
        if (r.kind === "caption" && r.text) {
          zip.file("caption.txt", r.text);
        } else if (r.url) {
          const res = await fetch(r.url);
          zip.file(`${r.key}.${EXT[r.kind] ?? "bin"}`, await res.blob());
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const href = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = href;
      el.download = "campaign-assets.zip";
      el.click();
      URL.revokeObjectURL(href);
    } catch {
      toast.error(
        "Couldn't build the zip — try downloading assets individually.",
      );
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Campaign assets
        </h3>
        <div className="flex items-center gap-1.5">
          {(imageUrl || (caption && caption.trim())) && (
            <button
              type="button"
              onClick={makePdf}
              disabled={pdfBusy}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] hover:border-primary/50 disabled:opacity-60"
              title="Branded one-pager: image + caption + logo"
              data-testid="button-pdf"
            >
              {pdfBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              PDF
            </button>
          )}
          <button
            type="button"
            onClick={downloadAll}
            disabled={zipping}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] hover:border-primary/50 disabled:opacity-60"
            data-testid="button-download-all"
          >
            {zipping ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Package className="h-3 w-3" />
            )}
            Download all
          </button>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {present.map((r) => {
          const Icon = r.icon;
          return (
            <li
              key={r.key}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">
                {r.label}
                {r.kind === "caption" && r.text ? (
                  <span className="ml-1 text-muted-foreground">
                    — “{r.text.slice(0, 32)}
                    {r.text.length > 32 ? "…" : ""}”
                  </span>
                ) : null}
              </span>
              {r.kind === "image" && r.url && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => onAddImage(r.url!)}
                  title="Add to the canvas as a layer"
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              )}
              {r.kind === "caption" && r.text && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-[11px]"
                  onClick={() => onAddText(r.text!)}
                  title="Add to the canvas as a text layer"
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              )}
              <button
                type="button"
                onClick={() =>
                  r.kind === "caption" && r.text
                    ? saveText(r.text, "caption.txt")
                    : r.url
                      ? saveUrl(r.url, `${r.key}.${EXT[r.kind] ?? "bin"}`)
                      : undefined
                }
                className="inline-flex items-center rounded p-1 text-muted-foreground hover:text-foreground"
                title="Download"
                data-testid={`button-download-${r.key}`}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
