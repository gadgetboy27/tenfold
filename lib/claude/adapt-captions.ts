import Anthropic from "@anthropic-ai/sdk";
import { PLATFORM_GUIDE } from "@/lib/social/caption-guide";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// PLATFORM_GUIDE moved to lib/social/caption-guide.ts (client-safe — no
// Anthropic import) — re-exported here so existing server-side importers of
// this module don't need to change. New client-side consumers should import
// from lib/social/caption-guide directly, never from this file.
export { PLATFORM_GUIDE };

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
