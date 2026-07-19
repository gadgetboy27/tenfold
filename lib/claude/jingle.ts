import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface JingleParams {
  /** What's being promoted — the campaign prompt / brand line. */
  topic: string;
  /** Musical genre, used to steer the lyric's cadence. */
  genre: string;
  brandVoice?: string;
}

/**
 * Writes a short, singable jingle for the vocals music option (ACE-Step). The
 * lyric is structured with `[verse]` / `[chorus]` tags — the exact structure
 * markers ACE-Step uses to shape a song — so the model sings a real hook rather
 * than mumbling the visual prompt. Kept short (a hook, not a full song) to fit a
 * social clip. Returns plain lyric text ready to hand to the model.
 */
export async function generateJingleLyrics(
  params: JingleParams,
): Promise<string> {
  const voiceBlock = params.brandVoice
    ? `\n\nMATCH THIS BRAND VOICE:\n${params.brandVoice}`
    : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are a jingle writer. Write a SHORT, catchy, singable jingle to advertise the thing below, in a ${params.genre} style.

Promoting: ${params.topic}${voiceBlock}

Rules:
- One short [verse] (2 lines) then one [chorus] (2 lines). That's it — a hook, not a full song.
- Simple, memorable, easy to sing. Rhyme where natural.
- Return ONLY the lyric, using the literal structure tags [verse] and [chorus] on their own lines. No title, no notes, no chords.`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response from Claude");
  return block.text.trim();
}
