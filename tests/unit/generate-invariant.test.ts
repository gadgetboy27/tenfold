import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `generating` gates the Generate button. If it is ever left true, the button
 * is dead until a page refresh — no error, no toast, no way to retry. That is
 * exactly how "the Generate button does nothing" was reported, and the cause
 * was `poll()` exhausting its attempts and falling out of its loop without
 * resetting the flag.
 *
 * A behavioural test would need the whole Studio tree mounted with fal and
 * Supabase stubbed. These assert the two structural properties that actually
 * prevent the bug, which is worth more than nothing and runs in milliseconds.
 */
const studio = readFileSync(
  join(process.cwd(), "components/studio/Studio.tsx"),
  "utf8",
);

function generateBody(): string {
  const start = studio.indexOf("const generate = async (overridePrompt");
  expect(start).toBeGreaterThan(-1);
  // Up to the closing of the function — the next line that is exactly "  };".
  const end = studio.indexOf("\n  };", start);
  expect(end).toBeGreaterThan(start);
  return studio.slice(start, end);
}

describe("generate() always re-enables the button", () => {
  it("resets `generating` in a finally block, not just on the happy path", () => {
    const body = generateBody();
    const finallyIdx = body.indexOf("} finally {");
    expect(
      finallyIdx,
      "generate() must use finally so a poll timeout or unexpected throw still re-enables the button",
    ).toBeGreaterThan(-1);
    // The reset must live INSIDE finally, not merely somewhere after it.
    expect(body.slice(finallyIdx)).toContain("setGenerating(false)");
  });

  it("does not rely on a catch block alone", () => {
    // The old shape reset the flag only in catch, so a path that neither threw
    // nor succeeded (the exhausted poll loop) left it true forever.
    const body = generateBody();
    const catchIdx = body.indexOf("} catch (");
    const finallyIdx = body.indexOf("} finally {");
    expect(catchIdx).toBeGreaterThan(-1);
    expect(finallyIdx).toBeGreaterThan(catchIdx);
  });
});

describe("poll() cannot exit silently", () => {
  it("throws when it runs out of attempts instead of falling through", () => {
    const start = studio.indexOf("const poll = async (id: string)");
    expect(start).toBeGreaterThan(-1);
    const body = studio.slice(start, studio.indexOf("\n  };", start));
    const loopEnd = body.lastIndexOf("}");
    // Something after the while loop must throw, so the caller learns the
    // generation is still running rather than the UI freezing.
    expect(
      body.slice(loopEnd).includes("throw") || body.includes("throw new Error"),
    ).toBe(true);
    expect(body).toContain("Still generating");
  });
});
