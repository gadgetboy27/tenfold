import { describe, expect, it } from "vitest";
import { fitInto, isOutside, safeRect } from "@/lib/composition/fit";

describe("safeRect", () => {
  it("uses the same pixel margin in every shape", () => {
    const wide = safeRect("16:9"); // 1920x1080
    const tall = safeRect("9:16"); // 1080x1920
    expect(wide.left).toBe(tall.left);
    expect(wide.top).toBe(tall.top);
    expect(wide.right).toBe(1920 - wide.left);
    expect(tall.bottom).toBe(1920 - tall.top);
  });
});

describe("fitInto", () => {
  const tall = safeRect("9:16");
  // A headline laid out for 1920 wide: 1600px across, 200 tall.
  const wideBlock = {
    cx: 540,
    cy: 960,
    unitHalfW: 800,
    unitHalfH: 100,
    scale: 1,
  };

  it("sees a 16:9 headline as outside a 9:16 frame", () => {
    expect(isOutside(wideBlock, tall)).toBe(true);
  });

  it("shrinks it to fit the width of the narrower frame", () => {
    const r = fitInto(wideBlock, tall);
    const usable = tall.right - tall.left;
    expect(r.resized).toBe(true);
    expect(r.scale).toBeLessThan(1);
    expect(r.scale * 2 * wideBlock.unitHalfW).toBeLessThanOrEqual(usable + 1);
    expect(
      isOutside({ ...wideBlock, scale: r.scale, cx: r.cx, cy: r.cy }, tall),
    ).toBe(false);
  });

  it("never grows a box that already fits", () => {
    const small = { cx: 540, cy: 960, unitHalfW: 100, unitHalfH: 40, scale: 1 };
    const r = fitInto(small, tall);
    expect(r.scale).toBe(1);
    expect(r.resized).toBe(false);
    expect(r.moved).toBe(false);
  });

  it("slides a box that fits but hangs off an edge back inside", () => {
    const hanging = {
      cx: 20,
      cy: 960,
      unitHalfW: 200,
      unitHalfH: 50,
      scale: 1,
    };
    expect(isOutside(hanging, tall)).toBe(true);
    const r = fitInto(hanging, tall);
    expect(r.moved).toBe(true);
    expect(r.resized).toBe(false);
    expect(r.cx - 200).toBeGreaterThanOrEqual(tall.left);
  });

  it("accounts for height as well as width", () => {
    const high = {
      cx: 540,
      cy: 960,
      unitHalfW: 100,
      unitHalfH: 1500,
      scale: 1,
    };
    const r = fitInto(high, tall);
    expect(r.resized).toBe(true);
    expect(r.scale * 2 * 1500).toBeLessThanOrEqual(tall.bottom - tall.top + 1);
  });

  it("honours a scale that is already smaller than the frame needs", () => {
    const r = fitInto({ ...wideBlock, scale: 0.4 }, tall);
    expect(r.scale).toBe(0.4);
    expect(r.resized).toBe(false);
  });

  it("is stable — fitting a fitted box changes nothing", () => {
    const first = fitInto(wideBlock, tall);
    const again = fitInto(
      { ...wideBlock, scale: first.scale, cx: first.cx, cy: first.cy },
      tall,
    );
    expect(again.resized).toBe(false);
    expect(again.moved).toBe(false);
  });

  it("centres a box pinned at the minimum scale instead of leaving it on one side", () => {
    const r = fitInto(
      { cx: 100, cy: 100, unitHalfW: 5000, unitHalfH: 50, scale: 1 },
      tall,
      0.5,
    );
    expect(r.scale).toBe(0.5);
    expect(r.cx).toBe((tall.left + tall.right) / 2);
  });
});
