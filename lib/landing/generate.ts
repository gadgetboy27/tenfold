import Anthropic from "@anthropic-ai/sdk";
import {
  LANDING_STYLES,
  LANDING_STYLE_INFO,
  blockSchema,
  landingDocSchema,
  type LandingBlock,
  type LandingDoc,
  type LandingStyle,
  type LandingTheme,
} from "./blocks";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface LandingBrief {
  campaignName: string;
  /** The campaign prompt — what the ads are about. */
  prompt: string;
  /** The caption going out with the ads, if one is written. */
  caption: string;
  theme: LandingTheme;
  /** The hero image: the render being published, or the anchor. */
  heroImageUrl: string;
  /** Everything else this campaign made, for the gallery block. */
  galleryImageUrls: string[];
}

/**
 * The model writes copy. It does NOT choose images.
 *
 * Asset URLs are long, signed-looking and numerous, and a model asked to emit
 * one will eventually emit a plausible one that 404s. So the tool schema has
 * no image field at all: blocks come back as pure copy and `hydrate()` below
 * attaches the real URLs from the campaign. A hero can't point at an image
 * that doesn't exist if there was never a way to name one.
 */
const PAGE_TOOL: Anthropic.Tool = {
  name: "write_landing_pages",
  description:
    "Return three complete landing pages for this campaign — one of each style.",
  input_schema: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        description:
          "Exactly three pages: one 'lead', one 'story', one 'offer'.",
        items: {
          type: "object",
          properties: {
            style: { type: "string", enum: [...LANDING_STYLES] },
            title: {
              type: "string",
              description: "Browser tab / SEO title. Under 60 characters.",
            },
            description: {
              type: "string",
              description:
                "Meta description. One sentence, under 155 characters.",
            },
            blocks: {
              type: "array",
              description:
                "The page, top to bottom. Start with a hero. A page that asks for details must include a form block.",
              items: {
                type: "object",
                properties: {
                  kind: {
                    type: "string",
                    enum: [
                      "hero",
                      "features",
                      "gallery",
                      "text",
                      "cta",
                      "form",
                      "footer",
                    ],
                  },
                  headline: {
                    type: "string",
                    description: "hero and cta only.",
                  },
                  heading: {
                    type: "string",
                    description: "features, gallery, text and form only.",
                  },
                  sub: {
                    type: "string",
                    description: "Supporting line under a headline.",
                  },
                  body: { type: "string", description: "text block only." },
                  items: {
                    type: "array",
                    description:
                      "features only. Three or four is usually right.",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        body: { type: "string" },
                      },
                      required: ["title", "body"],
                    },
                  },
                  ctaLabel: {
                    type: "string",
                    description:
                      "Button text on a hero or cta block. Written as an action.",
                  },
                  fields: {
                    type: "array",
                    description:
                      "form only. Ask for as little as the job needs — every extra field costs conversions.",
                    items: {
                      type: "object",
                      properties: {
                        name: {
                          type: "string",
                          description: "lowercase_with_underscores",
                        },
                        label: { type: "string" },
                        type: {
                          type: "string",
                          enum: ["text", "email", "tel", "textarea"],
                        },
                        required: { type: "boolean" },
                      },
                      required: ["name", "label", "type", "required"],
                    },
                  },
                  submitLabel: { type: "string", description: "form only." },
                  successMessage: {
                    type: "string",
                    description: "form only. Shown after a successful submit.",
                  },
                  tone: {
                    type: "string",
                    enum: ["default", "muted", "brand", "dark"],
                    description:
                      "Section background. Alternate so sections read as separate.",
                  },
                },
                required: ["kind"],
              },
            },
          },
          required: ["style", "title", "description", "blocks"],
        },
      },
    },
    required: ["pages"],
  },
};

const SYSTEM = `You are a direct-response copywriter writing landing pages that convert paid traffic.

You are given ONE campaign: its brief, the caption running on the ads, and its brand. Write three pages for it, in three different styles:

- lead: ${LANDING_STYLE_INFO.lead.blurb} Short. Hero, a form near the top, three reasons to trust, footer.
- story: ${LANDING_STYLE_INFO.story.blurb} Longer. Hero, what it is, features, the work itself, then a form.
- offer: ${LANDING_STYLE_INFO.offer.blurb} Tightest of the three. Hero, the offer, one call to action, footer. No form unless the offer needs claiming.

Rules that matter more than style:
- The page must say what the ADS say. Someone clicked a specific promise; a page that opens on a different one bounces.
- Write plainly. No "unlock", no "revolutionise", no "elevate your", no invented statistics, no fake scarcity, no testimonials — you have no customers to quote and inventing one is fraud.
- Never invent a price, a phone number, an address, a guarantee or a deadline. If the brief doesn't say it, the page doesn't claim it.
- New Zealand English.
- Every page ends with a footer block.
- Vary the tone field so sections separate visually, but do not alternate mechanically on every block.`;

/** Model output before we attach images and ids. */
interface RawBlock {
  kind?: string;
  headline?: string;
  heading?: string;
  sub?: string;
  body?: string;
  items?: { title?: string; body?: string }[];
  ctaLabel?: string;
  fields?: {
    name?: string;
    label?: string;
    type?: string;
    required?: boolean;
  }[];
  submitLabel?: string;
  successMessage?: string;
  tone?: string;
}

/**
 * Turn one model block into a real one — or drop it.
 *
 * Returns null rather than throwing on anything malformed. One bad block in a
 * twenty-one block response should cost that block, not all three pages: the
 * credits are already spent by the time this runs, and a hard parse failure
 * would refund them while throwing away work that was mostly fine.
 */
function toBlock(
  raw: RawBlock,
  index: number,
  brief: LandingBrief,
  hasForm: boolean,
): LandingBlock | null {
  const id = `b${index}`;
  const tone = raw.tone ?? undefined;
  // A button can only point at a form that exists on the page. Where it
  // doesn't, the block keeps its copy and loses the button rather than
  // shipping a link that scrolls nowhere.
  const cta = raw.ctaLabel
    ? { label: raw.ctaLabel.slice(0, 60), href: "#form" }
    : null;

  const candidate = (() => {
    switch (raw.kind) {
      case "hero":
        return {
          id,
          kind: "hero",
          headline: raw.headline ?? raw.heading ?? brief.campaignName,
          sub: raw.sub ?? "",
          imageUrl: brief.heroImageUrl,
          cta: hasForm ? cta : null,
          tone,
        };
      case "features":
        return raw.items?.length
          ? {
              id,
              kind: "features",
              heading: raw.heading ?? "",
              items: raw.items
                .filter((i) => i.title)
                .slice(0, 6)
                .map((i) => ({
                  title: (i.title ?? "").slice(0, 80),
                  body: (i.body ?? "").slice(0, 300),
                })),
              tone,
            }
          : null;
      case "gallery":
        // Dropped entirely when the campaign has nothing else to show — an
        // empty gallery heading over blank space is worse than no section.
        return brief.galleryImageUrls.length
          ? {
              id,
              kind: "gallery",
              heading: raw.heading ?? "",
              imageUrls: brief.galleryImageUrls.slice(0, 12),
              tone,
            }
          : null;
      case "text":
        return raw.body
          ? {
              id,
              kind: "text",
              heading: raw.heading ?? "",
              body: raw.body,
              tone,
            }
          : null;
      case "cta":
        return raw.headline && hasForm && cta
          ? {
              id,
              kind: "cta",
              headline: raw.headline,
              sub: raw.sub ?? "",
              cta,
              tone,
            }
          : null;
      case "form":
        return raw.fields?.length
          ? {
              id,
              kind: "form",
              heading: raw.heading ?? "",
              sub: raw.sub ?? "",
              fields: raw.fields
                .filter((f) => f.name && f.label && f.type)
                .slice(0, 8)
                .map((f) => ({
                  name: (f.name ?? "")
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, "_")
                    .replace(/^[^a-z]+/, "")
                    .slice(0, 40),
                  label: (f.label ?? "").slice(0, 60),
                  type: f.type,
                  required: f.required ?? false,
                })),
              submitLabel: raw.submitLabel || "Send",
              successMessage:
                raw.successMessage || "Thanks — we'll be in touch.",
              tone,
            }
          : null;
      case "footer":
        return {
          id,
          kind: "footer",
          businessName: brief.theme.businessName,
          line: raw.body ?? raw.sub ?? "",
          tone,
        };
      default:
        return null;
    }
  })();

  if (!candidate) return null;
  const parsed = blockSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export interface LandingGenerationResult {
  pages: LandingDoc[];
  actualCostUsd: number;
}

/** claude-sonnet-4-6 pricing per 1M tokens (USD). */
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

/**
 * Three landing pages from one campaign, in one call.
 *
 * One call rather than three because the three pages should differ by
 * STRATEGY, not by random sampling — a model writing all three at once can see
 * what it already used for the enquiry page when it writes the offer page.
 * Three independent calls reliably produce three near-identical heroes.
 */
export async function generateLandingPages(
  brief: LandingBrief,
): Promise<LandingGenerationResult> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: SYSTEM,
    tools: [PAGE_TOOL],
    tool_choice: { type: "tool", name: "write_landing_pages" },
    messages: [
      {
        role: "user",
        content: [
          `Campaign: ${brief.campaignName}`,
          `What the campaign is about: ${brief.prompt || "(not given)"}`,
          brief.caption
            ? `The caption running on the ads — the promise the click was made on:\n"${brief.caption}"`
            : "No caption is written yet; work from the brief.",
          brief.theme.businessName
            ? `Business name: ${brief.theme.businessName}`
            : "",
          brief.galleryImageUrls.length
            ? `There are ${brief.galleryImageUrls.length} more campaign images available for a gallery block.`
            : "There are no extra images — do not use a gallery block.",
          "",
          "Write the three pages.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const call = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!call) throw new Error("The page writer returned nothing.");

  const raw = call.input as {
    pages?: {
      style?: string;
      title?: string;
      description?: string;
      blocks?: RawBlock[];
    }[];
  };
  const seen = new Set<LandingStyle>();
  const pages: LandingDoc[] = [];

  for (const page of raw.pages ?? []) {
    const style = LANDING_STYLES.find((s) => s === page.style);
    // One page per style. A duplicate is a wasted choice, not a bonus.
    if (!style || seen.has(style)) continue;

    const rawBlocks = page.blocks ?? [];
    const hasForm = rawBlocks.some((b) => b.kind === "form");
    const blocks = rawBlocks
      .map((b, i) => toBlock(b, i, brief, hasForm))
      .filter((b): b is LandingBlock => b !== null);
    if (blocks.length === 0) continue;

    const doc = landingDocSchema.safeParse({
      style,
      title: (page.title || brief.campaignName).slice(0, 120),
      description: (page.description ?? "").slice(0, 300),
      blocks: blocks.slice(0, 12),
      theme: brief.theme,
    });
    if (!doc.success) continue;
    seen.add(style);
    pages.push(doc.data);
  }

  if (pages.length === 0) {
    // Nothing survived — the caller refunds. Distinct from "two of three came
    // back", which is a usable result and must not throw.
    throw new Error("The page writer's output couldn't be used. Try again.");
  }

  const usage = message.usage;
  const actualCostUsd =
    (usage.input_tokens / 1_000_000) * INPUT_COST_PER_M +
    (usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_M;

  return { pages, actualCostUsd };
}
