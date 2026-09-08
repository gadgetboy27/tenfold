import { z } from "zod";

/**
 * The landing page document — the "separable parts" of a campaign page.
 *
 * Mirrors `lib/composition/layers.ts` deliberately: a Zod discriminated union
 * on a `kind` field, parsed at every boundary, so adding a block is a compile
 * error everywhere that block isn't handled yet. Two document models in one
 * product should read the same way; a second dialect is a second thing to
 * learn for no gain.
 *
 * Where it differs from a composition, and why: a composition is an absolutely
 * positioned canvas at a fixed pixel size, because an ad IS a fixed pixel size.
 * A landing page is a vertical stack that has to survive 375px and 1440px with
 * the same content. So blocks carry no coordinates at all — order is the only
 * spatial property, and the renderer owns layout. Free positioning is exactly
 * what makes hand-built pages break on a phone.
 */

/** Every block carries these; the union adds the rest. */
const baseBlock = {
  id: z.string().min(1).max(64),
};

/**
 * Accent override. A block may depart from the page theme (one dark section
 * in a light page is a standard device), but only onto the theme's own colours
 * — an arbitrary hex per block is how a generated page stops looking like one
 * brand.
 */
const toneSchema = z.enum(["default", "muted", "brand", "dark"]);
export type BlockTone = z.infer<typeof toneSchema>;

const ctaSchema = z.object({
  label: z.string().min(1).max(60),
  /**
   * Either an anchor to the form block on the same page (`#form`) or an
   * absolute URL. Relative paths are rejected: this page is served from our
   * domain, and a stray "/pricing" would point at OUR pricing page, not the
   * customer's.
   */
  href: z
    .string()
    .max(2000)
    .refine((v) => v === "#form" || /^https?:\/\//i.test(v), {
      message: "Link must be #form or a full https:// URL",
    }),
});
export type LandingCta = z.infer<typeof ctaSchema>;

/** A form field. Deliberately four types, not an open input-type passthrough. */
const fieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Field names are lowercase and underscored"),
  label: z.string().min(1).max(60),
  type: z.enum(["text", "email", "tel", "textarea"]),
  required: z.boolean().default(false),
});
export type LandingField = z.infer<typeof fieldSchema>;

export const blockSchema = z.discriminatedUnion("kind", [
  z.object({
    ...baseBlock,
    kind: z.literal("hero"),
    headline: z.string().min(1).max(120),
    sub: z.string().max(300).default(""),
    /** A campaign asset URL. Empty means "type only" — a valid hero. */
    imageUrl: z.string().max(2000).default(""),
    cta: ctaSchema.nullable().default(null),
    tone: toneSchema.default("default"),
  }),
  z.object({
    ...baseBlock,
    kind: z.literal("features"),
    heading: z.string().max(120).default(""),
    items: z
      .array(
        z.object({
          title: z.string().min(1).max(80),
          body: z.string().max(300).default(""),
        }),
      )
      .min(1)
      .max(6),
    tone: toneSchema.default("default"),
  }),
  z.object({
    ...baseBlock,
    kind: z.literal("gallery"),
    heading: z.string().max(120).default(""),
    imageUrls: z.array(z.string().max(2000)).min(1).max(12),
    tone: toneSchema.default("default"),
  }),
  z.object({
    ...baseBlock,
    kind: z.literal("text"),
    heading: z.string().max(120).default(""),
    body: z.string().min(1).max(2000),
    tone: toneSchema.default("default"),
  }),
  z.object({
    ...baseBlock,
    kind: z.literal("cta"),
    headline: z.string().min(1).max(120),
    sub: z.string().max(300).default(""),
    cta: ctaSchema,
    tone: toneSchema.default("brand"),
  }),
  z.object({
    ...baseBlock,
    kind: z.literal("form"),
    heading: z.string().max(120).default(""),
    sub: z.string().max(300).default(""),
    fields: z.array(fieldSchema).min(1).max(8),
    submitLabel: z.string().min(1).max(40).default("Send"),
    /** Shown in place of the form after a successful submit. */
    successMessage: z.string().max(300).default("Thanks — we'll be in touch."),
    tone: toneSchema.default("muted"),
  }),
  z.object({
    ...baseBlock,
    kind: z.literal("footer"),
    businessName: z.string().max(120).default(""),
    line: z.string().max(300).default(""),
    tone: toneSchema.default("dark"),
  }),
]);

export type LandingBlock = z.infer<typeof blockSchema>;
export type LandingBlockKind = LandingBlock["kind"];

/**
 * The brand, snapshotted at publish time rather than read live.
 *
 * Editing the brand kit six months from now must not silently restyle a page
 * somebody is running paid traffic to. Same reasoning as
 * `campaigns.publish_asset_id`: what shipped is a fact, not a query.
 */
export const landingThemeSchema = z.object({
  primary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6366f1"),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#f59e0b"),
  font: z.string().max(60).default("Inter"),
  logoUrl: z.string().max(2000).default(""),
  businessName: z.string().max(120).default(""),
});
export type LandingTheme = z.infer<typeof landingThemeSchema>;

/**
 * The three styles.
 *
 * Not three random drafts — three different ANSWERS to "what should this page
 * do", which is the same choice the six anchor images ask you to make. A page
 * that qualifies a lead, a page that convinces a stranger, and a page that
 * closes one offer are structurally different documents, and picking between
 * three variations of one structure would be a worse question.
 */
export const LANDING_STYLES = ["lead", "story", "offer"] as const;
export type LandingStyle = (typeof LANDING_STYLES)[number];

export const LANDING_STYLE_INFO: Record<
  LandingStyle,
  { label: string; blurb: string }
> = {
  lead: {
    label: "Enquiry",
    blurb:
      "Short, form first. For when the click is worth a phone call — quotes, bookings, demos.",
  },
  story: {
    label: "Story",
    blurb:
      "The long version. Explains, shows the work, then asks. For a stranger who needs convincing.",
  },
  offer: {
    label: "Offer",
    blurb:
      "One thing, one button, nothing else to click. For a deal with a deadline.",
  },
};

export const landingDocSchema = z.object({
  style: z.enum(LANDING_STYLES),
  title: z.string().min(1).max(120),
  description: z.string().max(300).default(""),
  blocks: z.array(blockSchema).min(1).max(12),
  theme: landingThemeSchema,
});
export type LandingDoc = z.infer<typeof landingDocSchema>;

/** Does this page collect anything? Drives the leads UI and the `#form` anchor. */
export function formBlockOf(doc: LandingDoc) {
  return doc.blocks.find((b) => b.kind === "form") ?? null;
}

/**
 * Slug words that would be swallowed by a static route.
 *
 * `/[workspace]` and `/p/[slug]` are both root-level segments, so a page or a
 * workspace named `about` is unreachable behind the real /about. This list is
 * the app's actual static top level — keep it in step with `app/`.
 */
export const RESERVED_SLUGS = new Set([
  "p",
  "api",
  "auth",
  "about",
  "guides",
  "pricing",
  "privacy",
  "terms",
  "login",
  "signup",
  "content",
  "admin",
  "dashboard",
  "settings",
  "static",
  "_next",
]);

/**
 * A URL-safe slug for a page, from its campaign name.
 *
 * Suffixed with page-id entropy rather than checked-then-inserted: two people
 * publishing "Spring Sale" in the same second is a race a uniqueness check
 * loses, and the unique index would then throw at the worst moment. The suffix
 * also settles the reserved-word problem by construction — no generated slug
 * is ever a bare word.
 */
export function buildPageSlug(name: string, entropy: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const tail = entropy
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 6)
    .toLowerCase();
  return `${base || "page"}-${tail}`;
}
