"use client";

import { create } from "zustand";
import type {
  CompositionAspect,
  CompositionBackground,
  CompositionDoc,
  ImageLayer,
  Layer,
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

  load: (doc: CompositionDoc) => void;
  reset: () => void;
  markSaved: () => void;
  selectLayer: (id: string | null) => void;

  setAspect: (aspect: CompositionAspect) => void;
  setBackground: (background: CompositionBackground) => void;
  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, patch: LayerPatch) => void;
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

  // Auto-select the top layer so the properties/effects panel is visible
  // immediately — users shouldn't have to click around to discover it.
  load: (doc) =>
    set({
      doc,
      selectedLayerId: doc.layers.length
        ? doc.layers[doc.layers.length - 1].id
        : null,
      dirty: false,
    }),
  reset: () => set({ doc: null, selectedLayerId: null, dirty: false }),
  markSaved: () => set({ dirty: false }),
  selectLayer: (id) => set({ selectedLayerId: id }),

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
