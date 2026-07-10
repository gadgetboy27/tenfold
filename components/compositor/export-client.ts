"use client";

import { api } from "@/lib/api";
import type {
  CompositionAspect,
  CompositionDoc,
} from "@/lib/composition/layers";

/**
 * Client half of the export flow: the server renderer can only fetch http(s)
 * URLs, but lab compositions use blob: object URLs for local files. This
 * uploads any blob-backed background/image layers to storage first and
 * returns the doc rewritten with permanent URLs, then requests the render.
 */

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

async function uploadBlobUrl(
  src: string,
  kind: "image" | "video",
  workspaceSlug?: string,
): Promise<string> {
  const blob = await fetch(src).then((r) => r.blob());
  const ext = EXT_BY_TYPE[blob.type] ?? (kind === "video" ? "mp4" : "png");
  const form = new FormData();
  form.append("file", new File([blob], `${kind}.${ext}`, { type: blob.type }));
  const res = await api(`/api/uploads/${kind}`, {
    method: "POST",
    body: form,
    workspaceSlug,
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
  return data.url;
}

const isBlob = (u: string) => u.startsWith("blob:");

/** Upload every blob: source; returns the doc with permanent storage URLs. */
export async function materializeDoc(
  doc: CompositionDoc,
  workspaceSlug?: string,
): Promise<CompositionDoc> {
  const background = isBlob(doc.background.src)
    ? {
        ...doc.background,
        src: await uploadBlobUrl(
          doc.background.src,
          doc.background.kind,
          workspaceSlug,
        ),
      }
    : doc.background;

  const layers = await Promise.all(
    doc.layers.map(async (l) =>
      l.kind === "image" && isBlob(l.src)
        ? { ...l, src: await uploadBlobUrl(l.src, "image", workspaceSlug) }
        : l,
    ),
  );

  return { ...doc, background, layers };
}

export interface ExportOptions {
  /** Persist the MP4 as a campaign asset so the publish flow picks it up. */
  campaignId?: string | null;
  /** Music track layered under the film (replaces clip audio). */
  audioUrl?: string | null;
}

export async function requestExport(
  doc: CompositionDoc,
  workspaceSlug?: string,
  options: ExportOptions = {},
): Promise<{ url: string; durationSec: number }> {
  const res = await api("/api/compositions/export", {
    method: "POST",
    body: JSON.stringify({
      doc,
      campaignId: options.campaignId ?? null,
      audioUrl: options.audioUrl ?? null,
    }),
    workspaceSlug,
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    durationSec?: number;
    error?: string;
  };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Export failed");
  return { url: data.url, durationSec: data.durationSec ?? 0 };
}

export interface FanOutOutput {
  aspect: CompositionAspect;
  url: string;
  assetId: string | null;
  durationSec: number;
}

/** Render every requested aspect at once (the master reflowed per format, each
 *  with its overrides). Returns one output per aspect. */
export async function requestFanOutExport(
  doc: CompositionDoc,
  workspaceSlug: string | undefined,
  aspects: CompositionAspect[],
  options: ExportOptions = {},
): Promise<FanOutOutput[]> {
  const res = await api("/api/compositions/export", {
    method: "POST",
    body: JSON.stringify({
      doc,
      aspects,
      campaignId: options.campaignId ?? null,
      audioUrl: options.audioUrl ?? null,
    }),
    workspaceSlug,
  });
  const data = (await res.json().catch(() => ({}))) as {
    outputs?: FanOutOutput[];
    error?: string;
  };
  if (!res.ok || !data.outputs) throw new Error(data.error ?? "Export failed");
  return data.outputs;
}
