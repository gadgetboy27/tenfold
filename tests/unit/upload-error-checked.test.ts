import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every Storage upload must check its error.
 *
 * Supabase's `.upload()` RETURNS `{data, error}` — it does not throw. Left
 * unchecked, `getPublicUrl()` on the next line still builds a perfectly
 * valid-looking URL for an object that was never written, and the caller
 * inserts an asset row pointing at a 404. Nothing fails, nothing logs, and the
 * gap only surfaces when someone tries to play or publish it.
 *
 * Found in production: 3 asset rows out of 442 point at objects that do not
 * exist, all videos. CLAUDE.md records the same class of bug once before
 * (migration 0031 — the fal webhook inserted a logo row for an SVG the bucket
 * had rejected), which is what makes this worth pinning rather than fixing
 * twice and forgetting.
 *
 * Structural, because the invariant lives at every call site rather than in
 * one function that could be unit-tested.
 */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Remove block and line comments so prose can't masquerade as code. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const sources = [...tsFiles("lib"), ...tsFiles("app")].filter((p) =>
  stripComments(readFileSync(p, "utf8")).includes(".upload("),
);

describe("storage uploads", () => {
  it("finds the upload call sites at all", () => {
    // If this drops to zero the audit below is silently vacuous.
    expect(sources.length).toBeGreaterThan(3);
  });

  it.each(sources)("%s handles the upload error", (file) => {
    // Comments are stripped FIRST. Prose that quotes `.upload()` — including
    // the comments explaining this very bug — is not a call site, and a
    // scanner that cannot tell the difference fails on its own explanation.
    const src = stripComments(readFileSync(file, "utf8"));
    // Each upload must sit within reach of an error binding — either
    // `const { error } = await ...upload(` or a following guard. Checked by
    // slicing around each call rather than scanning the whole file, so an
    // unrelated error check elsewhere cannot vouch for an unguarded upload.
    let from = 0;
    for (;;) {
      const at = src.indexOf(".upload(", from);
      if (at === -1) break;
      // Deliberately a loose proxy: does the surrounding CODE mention `error`
      // at all? Matching specific shapes was brittle — a destructured binding,
      // an `if (!upErr)` guard and a `Promise.all` pair checked afterwards are
      // all correct and all look different, and a scanner that only knows two
      // of them pushes people to contort working code to satisfy the test.
      // Comments are already stripped, so an unchecked upload really does have
      // no `error` token near it.
      const window = src.slice(Math.max(0, at - 300), at + 400);
      expect(
        /\berror\b/i.test(window),
        `${file}: an .upload() near offset ${at} does not check its error — ` +
          `getPublicUrl will return a URL for an object that was never written`,
      ).toBe(true);
      from = at + 8;
    }
  });
});
