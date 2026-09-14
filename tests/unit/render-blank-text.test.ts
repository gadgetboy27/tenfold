import { describe, it, expect } from "vitest";
import { drawFrame } from "@/lib/composition/render";
import type { CompositionDoc } from "@/lib/composition/layers";

/**
 * Deleting every letter of a text block on the stage left "a small residue of
 * the panel": the scrim was painted behind a 1px-wide empty block. A blank
 * text layer must paint nothing at all — and must not disturb the canvas
 * state for the layers after it.
 */
function stubCtx() {
  const calls: string[] = [];
  let depth = 0;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === "save") return () => void (calls.push("save"), depth++);
      if (prop === "restore")
        return () => void (calls.push("restore"), depth--);
      if (prop === "measureText") return () => ({ width: 100 });
      if (prop === "canvas") return { width: 1080, height: 1080 };
      return (...args: unknown[]) => {
        calls.push(prop + (args.length ? `(${args.length})` : ""));
      };
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, depth: () => depth };
}

const text = (id: string, txt: string) => ({
  id,
  kind: "text" as const,
  text: txt,
  font: "Inter" as const,
  sizePx: 64,
  color: "#ffffff",
  align: "center" as const,
  bg: { color: "#000000", opacity: 0.45, padPx: 20 },
  pos: { mode: "fraction" as const, nx: 0.5, ny: 0.5 },
  scale: 1,
  rotationDeg: 0,
  opacity: 1,
  blend: "normal" as const,
  appearAt: 0,
  disappearAt: null,
  fadeSec: 0,
});

describe("blank text layers", () => {
  const doc: CompositionDoc = {
    id: "d",
    aspect: "1:1",
    background: { kind: "image", src: "http://x/bg.jpg" },
    layers: [text("empty", "   "), text("real", "Hello")],
  };

  it("paint no scrim and leave the canvas state balanced", () => {
    const { ctx, calls, depth } = stubCtx();
    drawFrame(ctx, {
      doc,
      t: 0,
      clipDuration: 10,
      background: null,
      images: new Map(),
      selectedLayerId: null,
      draggingLayerId: null,
      paused: true,
    });
    // fillRect is the frame clear plus one scrim — for "Hello" only. The
    // blank layer's scrim would make it three.
    expect(calls.filter((c) => c.startsWith("fillRect")).length).toBe(2);
    // And only one block of text is ever drawn.
    expect(calls.filter((c) => c.startsWith("fillText")).length).toBe(1);
    expect(depth()).toBe(0);
  });
});
