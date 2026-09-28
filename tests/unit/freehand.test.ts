import { describe, it, expect } from "vitest";
import {
  BRUSH_LABELS,
  BRUSH_TYPES,
  toCanvasPoint,
} from "@/lib/composition/freehand";

/**
 * Freehand's live canvas is displayed at whatever CSS size the rail gives it,
 * while strokes are recorded in the canvas's own pixel grid (so the exported
 * PNG doesn't come out at whatever arbitrary size the browser happened to lay
 * the element out at) — toCanvasPoint is the one piece of math bridging the
 * two, and it's the same "measure the real rect, don't assume 1:1" rule every
 * other drop/draw surface in this codebase follows (see tests/unit/tray.test.ts).
 */
describe("toCanvasPoint", () => {
  it("maps a client point through a displayed-smaller-than-native canvas", () => {
    // A plain stand-in rather than document.createElement — this suite runs
    // under Node, not jsdom (no real DOM), and toCanvasPoint only ever
    // touches width/height/getBoundingClientRect, so that's all it needs.
    const canvas = {
      width: 720,
      height: 720,
      // Displayed at 360x360 CSS px (half native) — as if scaled down by the rail.
      getBoundingClientRect: () =>
        ({ left: 100, top: 50, width: 360, height: 360 }) as DOMRect,
    } as HTMLCanvasElement;

    const centre = toCanvasPoint(100 + 180, 50 + 180, canvas);
    expect(centre.x).toBeCloseTo(360, 5);
    expect(centre.y).toBeCloseTo(360, 5);

    const topLeft = toCanvasPoint(100, 50, canvas);
    expect(topLeft.x).toBe(0);
    expect(topLeft.y).toBe(0);
  });

  it("every brush type has a label", () => {
    for (const b of BRUSH_TYPES) {
      expect(BRUSH_LABELS[b]).toBeTruthy();
    }
  });
});
