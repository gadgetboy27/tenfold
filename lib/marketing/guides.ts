/**
 * Long-form guides — the organic-search surface.
 *
 * Why this exists: the marketing pages sell the product, which means they
 * compete for terms like "AI marketing platform" that a new domain will not
 * win. Guides target specific questions people actually type, where intent is
 * high and competition is thin. That is the realistic path to organic traffic
 * without link-building.
 *
 * Content lives here as data rather than in a CMS on purpose — there are a
 * handful of guides, they change rarely, and keeping them in the repo means
 * they are reviewed, typed and deployed like everything else. Move to a CMS
 * when the count justifies it, not before.
 *
 * Writing rules that matter for ranking:
 * - Answer the question in the first paragraph. Both readers and AI answer
 *   engines reward a direct answer over a preamble.
 * - Be specific and factual. Vague marketing copy ranks for nothing.
 * - Only claim what the product actually does.
 */

export interface GuideSection {
  heading: string;
  body: string[];
}

export interface Guide {
  slug: string;
  title: string;
  /** Used verbatim as the meta description — keep near 155 characters. */
  description: string;
  /** ISO date. Shown to readers and emitted in the Article schema. */
  updated: string;
  /** One-paragraph direct answer, rendered before the sections. */
  answer: string;
  sections: GuideSection[];
}

export const GUIDES: Guide[] = [
  {
    slug: "do-you-own-ai-generated-images",
    title: "Do you own AI-generated images you make for your business?",
    description:
      "Whether you can legally use AI-generated images commercially, what ownership means in practice, and what to check before publishing.",
    updated: "2026-08-04",
    answer:
      "In most cases yes — if the tool you used grants you commercial rights in its terms. Ownership of AI output is governed by the agreement you accepted, not by copyright law alone, because in many jurisdictions (including New Zealand and the United States) purely machine-generated work may not attract copyright at all. That distinction matters less than people expect for ordinary business use, but it matters a great deal if you intend to stop someone else using a similar image.",
    sections: [
      {
        heading: "The terms decide what you can do",
        body: [
          "Every generative tool sets its own commercial terms, and they differ sharply. Some grant full commercial use. Some restrict it to paid tiers. Some reserve the right to reuse your outputs in their own marketing or training data.",
          "Before publishing anything commercially, find the sentence in the terms that says whether output can be used commercially, and whether that right survives cancelling your subscription. If a tool cannot answer that plainly, treat it as a risk.",
          "PrettyMuch grants commercial rights to everything you generate — images, video, music and captions — and that is written into the terms rather than buried in them.",
        ],
      },
      {
        heading: "Ownership and copyright are not the same question",
        body: [
          "A tool can grant you the right to use an image commercially without that image being protected by copyright. In New Zealand, copyright generally requires a human author. Work generated entirely by a machine sits in uncertain territory, and courts in several jurisdictions have declined to grant protection to output with no meaningful human authorship.",
          "For everyday business use — a social post, an ad, a website banner — this rarely matters. You need the right to use the image, which the terms give you.",
          "It matters if you want exclusivity: a logo you intend to defend, or a campaign image you do not want a competitor reproducing. There, the more human creative input involved in directing, selecting, editing and arranging the work, the stronger your position.",
        ],
      },
      {
        heading: "Three things worth checking before you publish",
        body: [
          "Recognisable people. If output resembles a real, identifiable person, publicity and privacy rights can apply regardless of who owns the image. Generated presenters are lower risk than a likeness of someone real.",
          "Trademarks and brands. A generated image containing another company's logo or trade dress is a trademark problem, not a copyright one, and the tool's terms will not protect you.",
          "Platform disclosure rules. Several social platforms now require AI-generated or materially altered content to be labelled. That is a platform policy question, separate from ownership, and the requirements change — check the current rules for each platform you publish to.",
        ],
      },
      {
        heading: "The practical summary",
        body: [
          "For normal commercial use, a tool that clearly grants commercial rights is enough. Read that clause before you commit to a platform, keep a record of what you generated and when, and add real human direction to anything you need to defend.",
          "This is general information, not legal advice. If a specific asset is commercially important to you, take advice on it.",
        ],
      },
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
