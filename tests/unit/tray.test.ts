import { describe, it, expect } from "vitest";
import {
  dropToFraction,
  dropToFractionInMedia,
  parseTrayItem,
  serializeTrayItem,
  TRAY_MIME,
  type TrayItem,
} from "@/lib/composition/tray";

/**
 * What these guard: "the logo landed somewhere else" is a bug you argue with
 * rather than notice, and the arithmetic that causes it is three lines of
 * subtraction. The letterbox case is the one that actually bites — every ad in
 * a container of a different aspect is letterboxed, which is most of them.
 */

// A 400x400 container showing a 9:16 ad: 225 wide, pillarboxed 87.5 each side.
const CONTAINER = { left: 100, top: 50, width: 400, height: 400 };
const MEDIA = { left: 87.5, top: 0, width: 225, height: 400 };

describe("dropToFraction", () => {
  it("measures against the media, not the container", () => {
    // The visual centre of the AD, which is also the centre of the container
    // here. Measured against the container this happens to agree; the next
    // test is the one that separates them.
    const { nx, ny } = dropToFraction(300, 250, CONTAINER, MEDIA);
    expect(nx).toBeCloseTo(0.5, 5);
    expect(ny).toBeCloseTo(0.5, 5);
  });

  it("does not count the letterbox bars as part of the ad", () => {
    // Drop on the ad's LEFT edge. Against the container that reads as 0.22 —
    // a fifth of the way in — and the layer would land visibly right of where
    // it was dropped.
    const { nx } = dropToFraction(100 + 87.5, 250, CONTAINER, MEDIA);
    expect(nx).toBeCloseTo(0.02, 5); // clamped to the inset, i.e. the edge
    const mismeasured = (100 + 87.5 - CONTAINER.left) / CONTAINER.width;
    expect(mismeasured).toBeCloseTo(0.219, 2);
  });

  it("keeps a drop inside the frame", () => {
    // Centred exactly on an edge means half the layer hangs outside, which
    // reads as "it vanished" and can't be grabbed again to fix.
    const tl = dropToFraction(0, 0, CONTAINER, MEDIA);
    expect(tl.nx).toBe(0.02);
    expect(tl.ny).toBe(0.02);
    const br = dropToFraction(9999, 9999, CONTAINER, MEDIA);
    expect(br.nx).toBe(0.98);
    expect(br.ny).toBe(0.98);
  });

  it("survives a zero-sized media rect instead of dividing by zero", () => {
    const { nx, ny } = dropToFraction(120, 70, CONTAINER, {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
    expect(Number.isFinite(nx)).toBe(true);
    expect(Number.isFinite(ny)).toBe(true);
  });
});

describe("dropToFractionInMedia", () => {
  // The preferred path: the <canvas> renders at design resolution under
  // max-w/h-full, so the browser letterboxes it and its own bounding box IS
  // the ad — no arithmetic to be wrong about.
  const MEDIA_CLIENT = { left: 187.5, top: 50, width: 225, height: 400 };

  it("agrees with the container-relative form", () => {
    // Same geometry expressed two ways; if these ever diverge, one caller is
    // placing layers somewhere the other wouldn't.
    for (const [x, y] of [
      [300, 250],
      [200, 100],
      [380, 400],
    ] as const) {
      expect(dropToFractionInMedia(x, y, MEDIA_CLIENT)).toEqual(
        dropToFraction(x, y, CONTAINER, MEDIA),
      );
    }
  });

  it("puts the media centre at 0.5", () => {
    const { nx, ny } = dropToFractionInMedia(
      MEDIA_CLIENT.left + MEDIA_CLIENT.width / 2,
      MEDIA_CLIENT.top + MEDIA_CLIENT.height / 2,
      MEDIA_CLIENT,
    );
    expect(nx).toBeCloseTo(0.5, 5);
    expect(ny).toBeCloseTo(0.5, 5);
  });

  it("clamps and survives a zero-sized rect", () => {
    expect(dropToFractionInMedia(-999, -999, MEDIA_CLIENT)).toEqual({
      nx: 0.02,
      ny: 0.02,
    });
    const z = dropToFractionInMedia(10, 10, {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
    expect(Number.isFinite(z.nx)).toBe(true);
    expect(Number.isFinite(z.ny)).toBe(true);
  });
});

describe("tray payloads", () => {
  it("round-trips a mark", () => {
    const item: TrayItem = {
      kind: "mark",
      id: "kit-light",
      label: "Brand mark",
      src: "https://example.test/mark.svg",
    };
    expect(parseTrayItem(serializeTrayItem(item))).toEqual(item);
  });

  it("round-trips lettering", () => {
    const item: TrayItem = {
      kind: "lettering",
      id: "lettering",
      text: "Summer Sale",
      font: "Playfair Display",
      fontSize: 72,
      color: "#ffffff",
      scrim: true,
    };
    expect(parseTrayItem(serializeTrayItem(item))).toEqual(item);
  });

  it("refuses a font the export cannot render", () => {
    // Renders in the browser, falls back everywhere downstream — same rule as
    // the logo lockup.
    const raw = JSON.stringify({
      kind: "lettering",
      id: "x",
      text: "Hi",
      font: "Comic Sans MS",
      fontSize: 40,
      color: "#fff",
      scrim: false,
    });
    expect(parseTrayItem(raw)).toMatchObject({ font: "Montserrat" });
  });

  it("treats anything foreign as not ours rather than throwing", () => {
    // A file, a URL, or text dragged from another window must not become a
    // layer nobody asked for.
    expect(parseTrayItem(null)).toBeNull();
    expect(parseTrayItem("")).toBeNull();
    expect(parseTrayItem("not json")).toBeNull();
    expect(parseTrayItem("{}")).toBeNull();
    expect(parseTrayItem('{"kind":"mark"}')).toBeNull(); // no src
    expect(parseTrayItem('{"kind":"something-else"}')).toBeNull();
  });

  it("uses a private MIME type, not text/plain", () => {
    // text/plain would make every dragged word a candidate layer.
    expect(TRAY_MIME).not.toBe("text/plain");
    expect(TRAY_MIME).toContain("prettymuch");
  });
});
