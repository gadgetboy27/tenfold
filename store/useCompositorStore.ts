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
import { mergeFormatOverrides } from "@/lib/composition/autofix";

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
  /**
   * Aspect for the Ad stage BEFORE a doc exists. `background.src` is a required
   * URL, so an empty artboard can't be a persisted doc — the stage renders a
   * placeholder at this aspect instead, and the first image chosen creates the
   * real doc with it. Lives here, not in AdStage's local state, because the
   * generation rail creates the doc from outside that component.
   */
  pendingAspect: CompositionAspect;
  setPendingAspect: (aspect: CompositionAspect) => void;
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
  /** Merge a batch of per-layer overrides into an aspect (the vision auto-fix
   *  applies its proposed nudges this way). */
  setFormatOverrides: (
    aspect: CompositionAspect,
    patch: Record<string, LayerOverride>,
  ) => void;
  /** Swap a layer in place (same stack position) — e.g. image ⇄ text
   *  conversion. The replacement keeps the old id via the caller. */
  replaceLayer: (id: string, layer: Layer) => void;
  removeLayer: (id: string) => void;
  /** Move a layer toward the front (up) or back (down) in render order. */
  moveLayer: (id: string, dir: "up" | "down") => void;

  /**
   * Undo history — snapshots of the whole doc, newest last.
   *
   * Every mutation already funnels through `editDoc`, which is the only reason
   * this is cheap: one choke point to snapshot, so no action can be added later
   * that silently escapes the history. Whole-doc snapshots rather than inverse
   * operations because a CompositionDoc is small JSON and correctness beats
   * cleverness here — an inverse-op log has to be right for every action, a
   * snapshot is right by construction.
   */
  past: CompositionDoc[];
  future: CompositionDoc[];
  undo: () => void;
  redo: () => void;
}

/**
 * How many steps back you can go.
 *
 * Docs are small (layers are JSON, media is referenced by URL, never inlined),
 * so this is kilobytes, not megabytes. Capped anyway: an unbounded stack in a
 * long editing session is a slow leak nobody attributes to undo.
 */
const HISTORY_LIMIT = 50;

/**
 * Apply an edit to the doc, marking the composition dirty and pushing the
 * PREVIOUS state onto the undo stack.
 *
 * Snapshotting here rather than at each call site is the whole design: this is
 * the single place a doc changes, so an action added later cannot forget to
 * record itself. A redo future is discarded on any new edit — the standard
 * rule, and the only one that can't produce a branch the UI has no way to show.
 */
function editDoc(
  state: CompositorState,
  mutate: (doc: CompositionDoc) => CompositionDoc,
): Partial<CompositorState> {
  if (!state.doc) return {};
  return {
    doc: mutate(state.doc),
    dirty: true,
    past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export const useCompositorStore = create<CompositorState>((set) => ({
  doc: null,
  selectedLayerId: null,
  dirty: false,
  overrideMode: false,
  pendingAspect: "1:1",
  past: [],
  future: [],

  setPendingAspect: (pendingAspect) => set({ pendingAspect }),

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
      // A different ad's history is not just useless, it's dangerous: undoing
      // into the previous project's doc would silently replace this one.
      past: [],
      future: [],
    }),
  reset: () =>
    set({
      doc: null,
      selectedLayerId: null,
      dirty: false,
      overrideMode: false,
      past: [],
      future: [],
    }),
  markSaved: () => set({ dirty: false }),

  /**
   * Step back one action.
   *
   * `dirty: true` on purpose — undo is an edit like any other, and the doc on
   * screen now differs from the one on the server. Leaving it clean would let
   * the autosave skip it, so a reload would resurrect the thing you undid.
   *
   * A restored doc may not contain the selected layer (undoing an add), which
   * would leave the properties panel bound to a layer that no longer exists.
   * Clearing the selection when it's missing is the cheap, always-correct fix.
   */
  undo: () =>
    set((s) => {
      const previous = s.past[s.past.length - 1];
      if (!previous || !s.doc) return {};
      return {
        doc: previous,
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future].slice(0, HISTORY_LIMIT),
        dirty: true,
        selectedLayerId: previous.layers.some((l) => l.id === s.selectedLayerId)
          ? s.selectedLayerId
          : null,
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next || !s.doc) return {};
      return {
        doc: next,
        past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        dirty: true,
        selectedLayerId: next.layers.some((l) => l.id === s.selectedLayerId)
          ? s.selectedLayerId
          : null,
      };
    }),
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

  setFormatOverrides: (aspect, patch) =>
    set((s) =>
      editDoc(s, (doc) => ({
        ...doc,
        overrides: mergeFormatOverrides(doc.overrides, aspect, patch),
      })),
    ),

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
