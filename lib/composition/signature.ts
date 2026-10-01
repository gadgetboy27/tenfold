import type { CompositionDoc } from "@/lib/composition/layers";

/**
 * A fingerprint of everything that decides what a render looks like — the
 * shape, the backdrop, every layer and the per-format nudges. Stored on a
 * render when it is made and compared against the stage later, so "is what
 * I'm about to publish the ad on the stage?" has a real answer that survives
 * reloads (it used to live in browser memory and be lost on refresh).
 *
 * Canonical on purpose: Postgres jsonb reorders object keys, so a doc loaded
 * back from the database must hash the same as the one in memory, which a
 * plain JSON.stringify would not guarantee. Two things are excluded because
 * they are not part of what the user made: `reveal.lineWidths` (measured at
 * export time) and anything undefined.
 */
function canonical(v: unknown, path: string[] = []): string {
  if (v === undefined) return "";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v))
    return `[${v.map((x) => canonical(x, path) || "null").join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([k, x]) => x !== undefined && k !== "lineWidths")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x, [...path, k])}`);
  return `{${entries.join(",")}}`;
}

/** cyrb53 — a fast 53-bit string hash; plenty to tell edits apart. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function docSignature(
  doc: Pick<CompositionDoc, "aspect" | "background" | "layers" | "overrides">,
): string {
  return hash53(
    canonical({
      aspect: doc.aspect,
      background: doc.background,
      layers: doc.layers,
      overrides: doc.overrides ?? {},
    }),
  );
}
