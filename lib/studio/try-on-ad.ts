import { api } from "@/lib/api";
import type { CompositionDoc, Layer } from "@/lib/composition/layers";
import { v4 as uuidv4 } from "uuid";

export type TryOnAdOutcome =
  | { ok: true }
  | { ok: false; reason: "no-campaign" | "no-ad" | "failed" };

/**
 * Add an image straight onto a campaign's ad, from OUTSIDE Studio's own
 * compositing surface — specifically Logo & Brand's "Try this on my ad",
 * where a logo concept hasn't been finalized (or saved as the brand kit) yet
 * and the user just wants to see it in context first.
 *
 * Deliberately does NOT go through `useCompositorStore`/`addImageToAd`
 * (components/studio/adBridge.ts), even though that's the one supported way
 * to put something on the ad everywhere else in Studio. Logo & Brand is a
 * "full" rail-mode section, so AdStage — the only thing that mounts the
 * shared canvas — is unmounted while it's open, and its unmount effect
 * resets the store. Writing through the store here would either silently
 * create a disconnected, unsaved doc (if `doc` is already null) or race
 * AdStage's own reload the moment the user navigates back. Going straight
 * to the same `/api/compositions` endpoints AdStage itself reads and writes
 * sidesteps that entirely: the layer is already saved by the time AdStage
 * remounts and re-fetches, so there is nothing to race.
 */
export async function tryImageOnAd(
  workspaceSlug: string,
  campaignId: string | null,
  imageUrl: string,
): Promise<TryOnAdOutcome> {
  if (!campaignId) return { ok: false, reason: "no-campaign" };
  try {
    const campRes = await api(`/api/campaigns/${campaignId}`, {
      workspaceSlug,
    });
    if (!campRes.ok) return { ok: false, reason: "failed" };
    const camp = (await campRes.json()) as {
      latestCompositionId?: string | null;
    };
    // No ad started yet — "try this on my ad" has nothing to land on. Unlike
    // addImageToAd (which can bootstrap a brand-new doc from a bare pending
    // aspect), there is no client-side aspect context to bootstrap one from
    // here, and a phantom doc with no other context is a worse experience
    // than asking the user to build the ad first.
    if (!camp.latestCompositionId) return { ok: false, reason: "no-ad" };

    const compRes = await api(`/api/compositions/${camp.latestCompositionId}`, {
      workspaceSlug,
    });
    if (!compRes.ok) return { ok: false, reason: "failed" };
    const row = (await compRes.json()) as {
      id: string;
      aspect: CompositionDoc["aspect"];
      background: CompositionDoc["background"];
      layers: Layer[];
      overrides?: CompositionDoc["overrides"];
    };

    const layer: Layer = {
      id: uuidv4(),
      kind: "image",
      src: imageUrl,
      pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    };
    const doc: CompositionDoc = {
      id: row.id,
      aspect: row.aspect,
      background: row.background,
      layers: [...row.layers, layer],
      overrides: row.overrides,
    };

    const saveRes = await api("/api/compositions/save", {
      method: "POST",
      body: JSON.stringify({ doc, campaignId }),
      workspaceSlug,
    });
    if (!saveRes.ok) return { ok: false, reason: "failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
