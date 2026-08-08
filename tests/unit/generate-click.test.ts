import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Generate button did nothing when clicked.
 *
 * `onClick={onGenerate}` passes React's MouseEvent as the first argument. That
 * was harmless while `generate()` took no parameters — but 07d4f66 added
 * `overridePrompt?: string` for Brand Brain's auto-generate, and from then on
 * the event arrived as the override. `(overridePrompt ?? prompt).trim()` then
 * called `.trim()` on an event object, throwing synchronously inside the click
 * handler: no state change, no toast, no network request, error only in the
 * console.
 *
 * TypeScript could not catch it. The prop is typed `onGenerate: () => void`,
 * and a function with optional parameters is assignable to a zero-parameter
 * type, which is in turn assignable where a click handler is expected. Both
 * ends type-check while disagreeing at runtime.
 *
 * Nothing about that is unique to this button, so the check is structural.
 */
const raw = readFileSync(
  join(process.cwd(), "components/studio/Studio.tsx"),
  "utf8",
);

/**
 * Comments are stripped before matching. The explanatory comment above the fix
 * quotes the broken form verbatim, and a naive grep would flag it — a
 * source-level assertion has to look at code, not prose about the code.
 */
const studio = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
  .join("\n");

describe("Generate button click wiring", () => {
  it("never passes a handler that accepts arguments straight to onClick", () => {
    // `onClick={onGenerate}` would silently feed the MouseEvent into
    // generate()'s optional first parameter.
    expect(studio).not.toContain("onClick={onGenerate}");
  });

  it("calls onGenerate with no arguments", () => {
    expect(studio).toContain("onClick={() => onGenerate()}");
  });

  it("generate() ignores a non-string override", () => {
    // Defence in depth: even if some future call site passes an event again,
    // it must fall back to the prompt rather than throw.
    const start = studio.indexOf("const generate = async (overridePrompt");
    expect(start).toBeGreaterThan(-1);
    const body = studio.slice(start, start + 900);
    expect(body).toContain('typeof overridePrompt === "string"');
    // And the trim must run on the guarded value, not the raw parameter.
    expect(body).not.toMatch(/\(overridePrompt \?\? prompt\)\.trim\(\)/);
  });
});
