"use client";

import { create } from "zustand";
import type {
  CompositionAspect,
  CompositionBackground,
  CompositionDoc,
  ImageLayer,
  Layer,
  LayerOverride,
  TextLayer,
} from "@/lib/composition/layers";

/**
 * Editing state for the layered compositor (docs/tenfold-compositor-brief.md).
 * Pure state + actions, no UI. The document mirrors what persists to the
 * compositions row via POST /api/compositions + PATCH /api/compositions/[id];
 * `dirty` tracks unsaved edits so the UI (Prompt 2) knows when to save.
 */

/** Editable per-layer fields (id/kind are fixed at creation). */
export type LayerPatch = Partial<Omit<ImageLayer, "id" | "kind">> &
  Partial<Omit<TextLayer, "id" | "kind">>;

interface CompositorState {
  doc: CompositionDoc | null;
  selectedLayerId: string | null;
  dirty: boolean;
  /** When true, canvas geometry edits (drag/resize) write to the CURRENT
   *  aspect's per-format override instead of the shared master layer. */
  overrideMode: boolean;

  load: (doc: CompositionDoc) => void;
  reset: () => void;
  markSaved: () => void;
  selectLayer: (id: string | null) => void;
  setOverrideMode: (on: boolean) => void;

  setAspect: (aspect: CompositionAspect) => void;
  setBackground: (background: CompositionBackground) => void;
  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, patch: LayerPatch) => void;
  /** Layout edit (position/size/rotation) from the canvas — writes to the
   *  master, or to the current aspect's override when overrideMode is on. */
  patchLayout: (id: string, patch: LayerOverride) => void;
  /** Drop the current aspect's override for one layer, or all layers (no id),
   *  reverting them to the master layout. */
  resetOverride: (id?: string) => void;
  /** Swap a layer in place (same stack position) — e.g. image ⇄ text
   *  conversion. The replacement keeps the old id via the caller. */
  replaceLayer: (id: string, layer: Layer) => void;
  removeLayer: (id: string) => void;
  /** Move a layer toward the front (up) or back (down) in render order. */
  moveLayer: (id: string, dir: "up" | "down") => void;
}

/** Apply an edit to the doc, marking the composition dirty. */
function editDoc(
  state: CompositorState,
  mutate: (doc: CompositionDoc) => CompositionDoc,
): Partial<CompositorState> {
  if (!state.doc) return {};
  return { doc: mutate(state.doc), dirty: true };
}

export const useCompositorStore = create<CompositorState>((set) => ({
  doc: null,
  selectedLayerId: null,
  dirty: false,
  overrideMode: false,

  // Auto-select the top layer so the properties/effects panel is visible
  // immediately — users shouldn't have to click around to discover it.
  load: (doc) =>
    set({
      doc,
      selectedLayerId: doc.layers.length
        ? doc.layers[doc.layers.length - 1].id
        : null,
      dirty: false,
      overrideMode: false,
    }),
  reset: () =>
    set({
      doc: null,
      selectedLayerId: null,
      dirty: false,
      overrideMode: false,
    }),
  markSaved: () => set({ dirty: false }),
  selectLayer: (id) => set({ selectedLayerId: id }),
  setOverrideMode: (on) => set({ overrideMode: on }),

  setAspect: (aspect) => set((s) => editDoc(s, (doc) => ({ ...doc, aspect }))),

  setBackground: (background) =>
    set((s) => editDoc(s, (doc) => ({ ...doc, background }))),

  addLayer: (layer) =>
    set((s) => ({
      ...editDoc(s, (doc) => ({ ...doc, layers: [...doc.layers, layer] })),
      selectedLayerId: s.doc ? layer.id : s.selectedLayerId,
    })),

  updateLayer: (id, patch) =>
    set((s) =>
      editDoc(s, (doc) => ({
        ...doc,
        layers: doc.layers.map((l) =>
          l.id === id ? ({ ...l, ...patch } as Layer) : l,
        ),
      })),
    ),

  patchLayout: (id, patch) =>
    set((s) => {
      if (!s.doc) return {};
      // Default: edit the shared master layer (affects every format via reflow).
      if (!s.overrideMode) {
        return editDoc(s, (doc) => ({
          ...doc,
          layers: doc.layers.map((l) =>
            l.id === id ? ({ ...l, ...patch } as Layer) : l,
          ),
        }));
      }
      // Override mode: merge the delta into this aspect's override only.
      const aspect = s.doc.aspect;
      return editDoc(s, (doc) => {
        const overrides = { ...(doc.overrides ?? {}) };
        const forAspect = { ...(overrides[aspect] ?? {}) };
        forAspect[id] = { ...(forAspect[id] ?? {}), ...patch };
        overrides[aspect] = forAspect;
        return { ...doc, overrides };
      });
    }),

  resetOverride: (id) =>
    set((s) => {
      if (!s.doc?.overrides) return {};
      const aspect = s.doc.aspect;
      return editDoc(s, (doc) => {
        const overrides = { ...(doc.overrides ?? {}) };
        if (!overrides[aspect]) return doc;
        if (id === undefined) {
          delete overrides[aspect];
        } else {
          const forAspect = { ...overrides[aspect] };
          delete forAspect[id];
          if (Object.keys(forAspect).length) overrides[aspect] = forAspect;
          else delete overrides[aspect];
        }
        return { ...doc, overrides };
      });
    }),

  replaceLayer: (id, layer) =>
    set((s) => ({
      ...editDoc(s, (doc) => ({
        ...doc,
        layers: doc.layers.map((l) => (l.id === id ? layer : l)),
      })),
      selectedLayerId: layer.id,
    })),

  removeLayer: (id) =>
    set((s) => {
      const remaining = s.doc?.layers.filter((l) => l.id !== id) ?? [];
      return {
        ...editDoc(s, (doc) => ({ ...doc, layers: remaining })),
        // Keep a selection alive (top remaining layer) so the properties
        // panel doesn't vanish after a delete.
        selectedLayerId:
          s.selectedLayerId === id
            ? (remaining[remaining.length - 1]?.id ?? null)
            : s.selectedLayerId,
      };
    }),

  moveLayer: (id, dir) =>
    set((s) =>
      editDoc(s, (doc) => {
        const i = doc.layers.findIndex((l) => l.id === id);
        const j = dir === "up" ? i + 1 : i - 1;
        if (i < 0 || j < 0 || j >= doc.layers.length) return doc;
        const layers = [...doc.layers];
        [layers[i], layers[j]] = [layers[j], layers[i]];
        return { ...doc, layers };
      }),
    ),
}));

export type { CompositionDoc, Layer, ImageLayer, TextLayer };
