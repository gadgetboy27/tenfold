import { describe, it, expect } from "vitest";
import {
  blockSchema,
  landingDocSchema,
  formBlockOf,
  buildPageSlug,
  RESERVED_SLUGS,
  LANDING_STYLES,
} from "@/lib/landing/blocks";

/**
 * The landing page document.
 *
 * These pin the decisions that are load-bearing rather than the shape of the
 * schema: what a page is allowed to link to, what a public form is allowed to
 * declare, and the fact that a generated slug can never collide with a static
 * route.
 */

const theme = {
  primary: "#6366f1",
  accent: "#f59e0b",
  font: "Inter",
  logoUrl: "",
  businessName: "Blue Maunga",
};

describe("what a page can link to", () => {
  it("takes the form anchor and full URLs", () => {
    for (const href of [
      "#form",
      "https://example.co.nz",
      "http://example.co.nz/x",
    ]) {
      const r = blockSchema.safeParse({
        id: "a",
        kind: "cta",
        headline: "Talk to us",
        cta: { label: "Get in touch", href },
      });
      expect(r.success, href).toBe(true);
    }
  });

  it("refuses a relative path", () => {
    // The one that matters. This page is served from OUR domain, so a stray
    // "/pricing" on a customer's landing page points at prettymuch.nz/pricing
    // — our pricing, on an ad they paid for.
    for (const href of ["/pricing", "/about", "pricing", "//evil.test"]) {
      const r = blockSchema.safeParse({
        id: "a",
        kind: "cta",
        headline: "x",
        cta: { label: "Go", href },
      });
      expect(r.success, href).toBe(false);
    }
  });
});

describe("what a public form can declare", () => {
  const form = (name: string) => ({
    id: "f",
    kind: "form" as const,
    fields: [{ name, label: "Name", type: "text" as const, required: true }],
  });

  it("accepts lowercase underscored names", () => {
    expect(blockSchema.safeParse(form("full_name")).success).toBe(true);
    expect(blockSchema.safeParse(form("email2")).success).toBe(true);
  });

  it("rejects anything that isn't a plain field name", () => {
    // These become jsonb keys on a row written by an unauthenticated request.
    // Constraining them here is cheaper than sanitising them at every read.
    for (const bad of ["Full Name", "full-name", "__proto__", "1st", ""]) {
      expect(blockSchema.safeParse(form(bad)).success, bad).toBe(false);
    }
  });

  it("caps the field count — every extra field costs conversions", () => {
    const many = {
      id: "f",
      kind: "form",
      fields: Array.from({ length: 9 }, (_, i) => ({
        name: `f${i}`,
        label: "x",
        type: "text",
        required: false,
      })),
    };
    expect(blockSchema.safeParse(many).success).toBe(false);
  });
});

describe("slugs cannot collide with a static route", () => {
  it("never produces a bare reserved word", () => {
    // /p/<slug> and /[workspace] are both root segments. A slug of "about"
    // would be shadowed by the real /about — so the suffix isn't cosmetic.
    for (const word of RESERVED_SLUGS) {
      const slug = buildPageSlug(word, "abc123def456");
      // The guarantee: whatever the name was, the suffix means the result is
      // never itself a reserved word. ("_next" also loses its underscore to
      // the a-z0-9 filter, which is why this asserts the property and not a
      // literal string.)
      expect(RESERVED_SLUGS.has(slug), slug).toBe(false);
      expect(slug.endsWith("-abc123"), slug).toBe(true);
      expect(slug, slug).toMatch(/^[a-z0-9][a-z0-9-]{2,59}$/);
    }
  });

  it("survives a name with nothing usable in it", () => {
    const slug = buildPageSlug("!!! ???", "abc123");
    expect(slug).toBe("page-abc123");
    // Must still satisfy the DB CHECK (^[a-z0-9][a-z0-9-]{2,59}$).
    expect(slug).toMatch(/^[a-z0-9][a-z0-9-]{2,59}$/);
  });

  it("keeps the whole thing inside the column's constraint", () => {
    const slug = buildPageSlug("x".repeat(200), "abcdef123456");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toMatch(/^[a-z0-9][a-z0-9-]{2,59}$/);
  });

  it("does not end up with a double or trailing hyphen", () => {
    expect(buildPageSlug("Spring — Sale!", "abc123")).toBe(
      "spring-sale-abc123",
    );
  });
});

describe("the document", () => {
  const page = (blocks: unknown[]) => ({
    style: "lead",
    title: "Get a quote",
    description: "",
    blocks,
    theme,
  });

  it("finds the form block, which is what the lead route validates against", () => {
    const doc = landingDocSchema.parse(
      page([
        { id: "h", kind: "hero", headline: "Hello" },
        {
          id: "f",
          kind: "form",
          fields: [
            { name: "email", label: "Email", type: "email", required: true },
          ],
        },
      ]),
    );
    expect(formBlockOf(doc)?.kind).toBe("form");
    // The default matters: a form with no success message shows a blank space
    // after submit, which reads as a failure.
    expect(formBlockOf(doc)?.successMessage).toBeTruthy();
  });

  it("reports no form on a page that doesn't collect anything", () => {
    const doc = landingDocSchema.parse(
      page([{ id: "h", kind: "hero", headline: "Hello" }]),
    );
    expect(formBlockOf(doc)).toBeNull();
  });

  it("refuses an empty page", () => {
    expect(landingDocSchema.safeParse(page([])).success).toBe(false);
  });

  it("only accepts the three styles", () => {
    expect(LANDING_STYLES).toEqual(["lead", "story", "offer"]);
    const bad = {
      ...page([{ id: "h", kind: "hero", headline: "x" }]),
      style: "landing",
    };
    expect(landingDocSchema.safeParse(bad).success).toBe(false);
  });
});
