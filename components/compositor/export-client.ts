"use client";

import { api } from "@/lib/api";
import {
  compositionDocSchema,
  type CompositionAspect,
  type CompositionDoc,
  weightOf,
} from "@/lib/composition/layers";
import { ensureBrandFontsLoaded } from "@/lib/composition/fonts";
import { docSignature } from "@/lib/composition/signature";

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

  return { ...doc, background, layers: await stampRevealWidths(layers) };
}

/**
 * Measure each read-out text's lines in the browser (the same canvas font the
 * preview draws with) and store the widths on the layer. The server's
 * drawtext can't light part of a line, so it places each line's growing
 * prefix at an x computed from these; it has no way to measure them itself.
 */
async function stampRevealWidths(
  layers: CompositionDoc["layers"],
): Promise<CompositionDoc["layers"]> {
  if (!layers.some((l) => l.kind === "text" && l.reveal)) return layers;
  await ensureBrandFontsLoaded();
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return layers;
  return layers.map((l) => {
    if (l.kind !== "text" || !l.reveal) return l;
    ctx.font = `${weightOf(l)} ${l.sizePx}px "${l.font}", sans-serif`;
    const lineWidths = l.text
      .split("\n")
      .map((line) => Math.max(1, ctx.measureText(line).width));
    return { ...l, reveal: { ...l.reveal, lineWidths } };
  });
}

export interface ExportOptions {
  /** Persist the MP4 as a campaign asset so the publish flow picks it up. */
  campaignId?: string | null;
  /** Music track layered under the film (replaces clip audio). */
  audioUrl?: string | null;
  /** Output resolution multiplier (1–3). Resamples the design space; it does
   *  not add detail a source photo never had. */
  scale?: number;
  /** Fingerprint of the stage doc being rendered — see signature.ts. */
  docSig?: string;
}

export async function requestExport(
  doc: CompositionDoc,
  workspaceSlug?: string,
  options: ExportOptions = {},
): Promise<{ url: string; assetId: string | null; durationSec: number }> {
  const res = await api("/api/compositions/export", {
    method: "POST",
    body: JSON.stringify({
      doc,
      campaignId: options.campaignId ?? null,
      audioUrl: options.audioUrl ?? null,
      ...(options.scale && options.scale !== 1 ? { scale: options.scale } : {}),
      ...(options.docSig ? { docSig: options.docSig } : {}),
    }),
    workspaceSlug,
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    assetId?: string | null;
    durationSec?: number;
    error?: string;
  };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Export failed");
  return {
    url: data.url,
    assetId: data.assetId ?? null,
    durationSec: data.durationSec ?? 0,
  };
}

/**
 * Render the finished cut AND lock it in — the one render path the whole
 * product uses. Uploads any local-file sources, renders (stamping the stage's
 * fingerprint on the result), then makes that render the file that publishes.
 *
 * It used to be two separate things: Compose rendered but never chose the
 * result, Publish chose it but never uploaded local files, so a render made on
 * one page was not the one the other page published and the user could not
 * tell which was which.
 */
export async function renderAndLock(
  doc: CompositionDoc,
  workspaceSlug: string | undefined,
  options: { campaignId: string; audioUrl?: string | null; scale?: number },
): Promise<{ url: string; assetId: string; materialized: CompositionDoc }> {
  const docSig = docSignature(doc);
  const materialized = await materializeDoc(doc, workspaceSlug);
  const { url, assetId } = await requestExport(materialized, workspaceSlug, {
    ...options,
    docSig,
  });
  // A render with no assetId means the file exists but its row didn't land.
  if (!assetId) {
    throw new Error(
      "Rendered, but it wasn't saved to this project — try again.",
    );
  }
  const patch = await api(`/api/campaigns/${options.campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({ publish_asset_id: assetId }),
    workspaceSlug,
  });
  if (!patch.ok) {
    throw new Error(
      "Rendered, but couldn't make it the one that publishes — tick it in the project strip.",
    );
  }
  return { url, assetId, materialized };
}

/**
 * Load a saved composition back into an editable doc — restores background,
 * layers, and per-format overrides so a reopened design renders identically.
 * Returns null when the row isn't a usable layered doc (no background/layers) or
 * fails validation, so the caller can fall back to building fresh.
 */
export async function fetchCompositionDoc(
  compositionId: string,
  workspaceSlug?: string,
): Promise<CompositionDoc | null> {
  const res = await api(`/api/compositions/${compositionId}`, {
    workspaceSlug,
  });
  if (!res.ok) return null;
  const row = (await res.json().catch(() => null)) as {
    id?: string;
    aspect?: string;
    background?: unknown;
    layers?: unknown;
    overrides?: unknown;
  } | null;
  if (
    !row?.background ||
    !Array.isArray(row.layers) ||
    row.layers.length === 0
  ) {
    return null;
  }
  const parsed = compositionDocSchema.safeParse({
    id: row.id,
    aspect: row.aspect,
    background: row.background,
    layers: row.layers,
    overrides: row.overrides ?? undefined,
  });
  return parsed.success ? parsed.data : null;
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
      ...(options.scale && options.scale !== 1 ? { scale: options.scale } : {}),
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
