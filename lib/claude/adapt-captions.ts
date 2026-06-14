import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Per-platform character ceilings + the voice each one rewards. The model is
// told to fit within `max` and lean into `style`.
const PLATFORM_GUIDE: Record<string, { max: number; style: string }> = {
  instagram: {
    max: 2200,
    style:
      "engaging and warm, a strong first line, tasteful emoji, 3–8 relevant hashtags at the end",
  },
  tiktok: {
    max: 150,
    style: "ultra-short punchy hook, 1–3 trending-style hashtags, very casual",
  },
  linkedin: {
    max: 3000,
    style:
      "professional and value-led, no emoji spam, at most 1–3 hashtags, a clear takeaway",
  },
  x: {
    max: 280,
    style: "tight and witty, one idea, at most 1–2 hashtags",
  },
  twitter: {
    max: 280,
    style: "tight and witty, one idea, at most 1–2 hashtags",
  },
  facebook: {
    max: 500,
    style: "conversational with a clear call to action, few hashtags",
  },
  youtube: {
    max: 4900,
    style: "descriptive and keyword-rich, a CTA to subscribe",
  },
  threads: { max: 500, style: "casual and conversational" },
  pinterest: {
    max: 500,
    style: "descriptive, keyword-rich and inspirational",
  },
};

export interface AdaptedCaption {
  platform: string;
  caption: string;
}

/**
 * Rewrite one base caption into a tailored version for each platform — fitting
 * its character limit and matching its voice. One Claude call, returns a map of
 * platform → caption. Falls back to a hard-truncated base caption on failure.
 */
export async function adaptCaptions(
  baseCaption: string,
  platforms: string[],
): Promise<Record<string, string>> {
  const targets = platforms
    .map((p) => ({ id: p, guide: PLATFORM_GUIDE[p] }))
    .filter((t) => t.guide);

  const fallback = (): Record<string, string> =>
    Object.fromEntries(
      targets.map((t) => [t.id, baseCaption.slice(0, t.guide.max)]),
    );

  if (!baseCaption.trim() || targets.length === 0) return fallback();

  const spec = targets
    .map(
      (t) =>
        `- ${t.id}: max ${t.guide.max} characters. Style: ${t.guide.style}.`,
    )
    .join("\n");

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `Rewrite this social caption for each platform below. Keep the same core message and brand intent, but fit EACH platform's character limit and voice. Never exceed the limit. Return JSON only — an object keyed by platform id, each value the caption string. No other text.

Base caption:
"""${baseCaption}"""

Platforms:
${spec}

JSON shape: { ${targets.map((t) => `"${t.id}": "<caption>"`).join(", ")} }`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") return fallback();
    const match = block.text.match(/\{[\s\S]*\}/);
    if (!match) return fallback();
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    const out: Record<string, string> = {};
    for (const t of targets) {
      const v = parsed[t.id];
      out[t.id] =
        typeof v === "string" && v.trim()
          ? v.trim().slice(0, t.guide.max)
          : baseCaption.slice(0, t.guide.max);
    }
    return out;
  } catch {
    return fallback();
  }
}
