import {
  ASPECT_DESIGN,
  effectiveLayer,
  type CompositionDoc,
  type Layer,
} from "@/lib/composition/layers";
import { ensureBrandFontsLoaded } from "./fonts";
import { coverRect, drawLayer } from "./render";

/**
 * Flatten the composed ad into one JPEG — what a photo post should publish.
 *
 * Publishing used to post the bare anchor image, so every overlay on the
 * stage (Wording, stickers, logos) was silently dropped and only the picture
 * reached the network. The only renderer that knows how every layer looks is
 * the canvas one, so this reuses its `drawLayer` and cover-fit exactly — the
 * same way "Combine into one panel" does (combine.ts) — rather than a second
 * server-side implementation that could drift from what the user saw.
 *
 * A still has no timeline: every layer is drawn at rest, at full opacity,
 * finished — a karaoke line shows all its words, a late-appearing layer is
 * present. Backgrounds that are video are not handled here (they publish as a
 * rendered clip instead).
 */

export function stillLayers(doc: CompositionDoc): Layer[] {
  return doc.layers
    .map((l) => effectiveLayer(l, doc.aspect, doc.overrides))
    .filter((l) => l.kind !== "text" || l.text.trim().length > 0);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

export async function renderStillJpeg(doc: CompositionDoc): Promise<Blob> {
  if (doc.background.kind !== "image") {
    throw new Error("Only a photo ad can be flattened to a still");
  }
  await ensureBrandFontsLoaded();
  const { width, height } = ASPECT_DESIGN[doc.aspect];

  const layers = stillLayers(doc);
  const images = new Map<string, HTMLImageElement>();
  const bg = await loadImage(doc.background.src);
  for (const l of layers) {
    if (l.kind === "image" && !images.has(l.src)) {
      images.set(l.src, await loadImage(l.src));
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't start the renderer");

  // JPEG has no alpha — start from black, as drawFrame does.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  const r = coverRect(bg.naturalWidth, bg.naturalHeight, width, height);
  ctx.drawImage(bg, r.x, r.y, r.width, r.height);

  for (const layer of layers) {
    drawLayer(
      ctx,
      layer,
      { dx: 0, dy: 0, rotDeg: 0, alpha: layer.opacity },
      doc.aspect,
      images,
    );
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image"))),
      "image/jpeg",
      0.92,
    ),
  );
}

/** Flatten and store it as a campaign asset; returns the new asset id. */
export async function uploadStill(
  doc: CompositionDoc,
  campaignId: string,
  post: (form: FormData) => Promise<Response>,
): Promise<string> {
  const blob = await renderStillJpeg(doc);
  const form = new FormData();
  form.append("file", new File([blob], "ad.jpg", { type: "image/jpeg" }));
  form.append("campaignId", campaignId);
  form.append("aspect", doc.aspect);
  const res = await post(form);
  const data = (await res.json().catch(() => ({}))) as {
    assetId?: string;
    error?: string;
  };
  if (!res.ok || !data.assetId) {
    throw new Error(data.error ?? "Couldn't save the finished image");
  }
  return data.assetId;
}
