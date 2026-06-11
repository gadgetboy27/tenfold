import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Fetch a workspace's saved brand-voice profile (undefined if none set). */
export async function getWorkspaceBrandVoice(
  workspaceId: string,
): Promise<string | undefined> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("brand_kits")
    .select("voice_profile")
    .eq("workspace_id", workspaceId)
    .single();
  const profile = (data?.voice_profile as string | null) ?? null;
  return profile && profile.trim() ? profile : undefined;
}

/**
 * Extract a concise, reusable brand-voice profile from a handful of the
 * business's best posts. The returned text is injected verbatim into the
 * caption/script generator so output sounds like the brand instead of generic
 * AI — directly addressing the market's #1 complaint ("it all sounds the same").
 */
export async function analyzeBrandVoice(samples: string[]): Promise<string> {
  const cleaned = samples
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 8);
  if (cleaned.length === 0) return "";

  const numbered = cleaned.map((s, i) => `Sample ${i + 1}:\n${s}`).join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `Below are real social posts from one brand. Distill their writing voice into a tight style guide another writer could follow to sound identical.

${numbered}

Return ONLY the style guide as compact directives (no preamble, no headings beyond the labels below), covering:
- Tone (3-5 adjectives)
- Vocabulary & phrasing (signature words, slang, jargon level)
- Sentence structure & rhythm (length, punctuation habits)
- Emoji / hashtag / capitalization habits
- Do / Don't (2-3 each)

Keep it under 180 words. Be specific to THESE samples, not generic advice.`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text.trim() : "";
}
