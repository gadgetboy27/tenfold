"use client";

import { useEffect } from "react";
import { useCompositorStore } from "@/store/useCompositorStore";

/**
 * The keys people already expect on a canvas.
 *
 * One hook, mounted by BOTH surfaces that show the composition — the Ad stage
 * and Compose. They are separate components (Compose takes the full width and
 * the stage stands down for it), so a handler written into one of them works
 * on exactly half the places the user is looking at a canvas. That asymmetry
 * is how the strip ended up staging videos but not stills.
 *
 * ── Delete ────────────────────────────────────────────────────────────────
 *
 * Reported as: to remove a caption box you had to find its row in the layer
 * list and hit the bin — or select the text and delete the characters, which
 * leaves an empty text layer behind and is two or three actions for one
 * intention. Select it, press Delete. That's it.
 *
 * Undo covers the mistake, which is what makes a destructive key acceptable at
 * all — there is no confirm here on purpose: a confirm on every delete is the
 * thing that trains people to stop reading confirms.
 *
 * ── Not while typing ──────────────────────────────────────────────────────
 *
 * Every shortcut here is suppressed inside an input, textarea or
 * contentEditable. The canvas's own inline text editor is a <textarea>, so
 * this is what stops "delete a character from the caption" becoming "delete
 * the caption layer" — the exact bug a naive global handler ships with.
 */
export function useAdShortcuts(): void {
  const undo = useCompositorStore((s) => s.undo);
  const redo = useCompositorStore((s) => s.redo);
  const removeLayer = useCompositorStore((s) => s.removeLayer);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (typing) return;

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        // Read the selection at press time rather than closing over it: the
        // hook would otherwise need re-binding on every selection change, and
        // a stale id deletes the wrong layer.
        const { selectedLayerId, doc } = useCompositorStore.getState();
        if (!selectedLayerId || !doc) return;
        if (!doc.layers.some((l) => l.id === selectedLayerId)) return;
        // Backspace is browser-Back on some setups when nothing is focused;
        // claiming it is the point, but only when we actually act.
        e.preventDefault();
        removeLayer(selectedLayerId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, removeLayer]);
}
