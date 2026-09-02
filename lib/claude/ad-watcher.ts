import Anthropic from "@anthropic-ai/sdk";
import {
  adWatchResultSchema,
  type AdWatchResult,
} from "@/lib/composition/ad-notes";
import { BRAND_FONTS } from "@/lib/composition/layers";
import type { VideoFrame } from "@/lib/composition/frames";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AdWatchInput {
  frames: VideoFrame[];
  /** What the ad is for — the campaign brief. */
  brief: string;
  /** The caption going out with it, when one exists. */
  caption?: string | null;
  /** Where it's being published, so notes can cite the right norms. */
  platforms: string[];
  /** Clip length, for pacing judgements. */
  durationSec: number;
  /** Overlays already on the ad — so it doesn't propose what's there. */
  existingText: string[];
  /**
   * Wording you want used, if you already know the claim.
   *
   * The watcher is told to place and style THIS rather than invent copy — the
   * "add before" direction. Left out, it writes its own, which you can still
   * edit at apply time.
   */
  steer?: string | null;
}

/**
 * The tool the model must answer through.
 *
 * A forced tool call rather than free text, for the same reason autofix.ts
 * uses one: a critique is only useful here if it maps onto something the
 * compositor can place, and prose would need parsing back into coordinates.
 */
const WATCH_TOOL: Anthropic.Tool = {
  name: "report_ad_notes",
  description: "Report what you observed watching this ad, in order.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["working", "notes"],
    properties: {
      working: {
        type: "string",
        description:
          "One line (max 240 chars) on what this ad already does well.",
      },
      notes: {
        type: "array",
        description:
          "At most 6 notes, ordered by how much each costs the ad. Fewer is better; an empty array is a valid answer for a good ad.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "atSec", "observation", "why", "confidence"],
          properties: {
            kind: {
              type: "string",
              enum: [
                "hook",
                "legibility",
                "safe_area",
                "branding",
                "cta",
                "pacing",
              ],
            },
            atSec: {
              type: "number",
              description: "Seconds into the clip where this was observed.",
            },
            observation: {
              type: "string",
              description: "What is wrong, in one sentence (max 240 chars).",
            },
            why: {
              type: "string",
              description: "What it costs the ad (max 240 chars).",
            },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            overlay: {
              type: "object",
              additionalProperties: false,
              required: ["text", "zone", "font", "color", "widthFrac", "scrim"],
              properties: {
                text: {
                  type: "string",
                  description: "The exact words to render (max 120 chars).",
                },
                zone: {
                  type: "string",
                  enum: [
                    "top-left",
                    "top",
                    "top-right",
                    "left",
                    "center",
                    "right",
                    "bottom-left",
                    "bottom",
                    "bottom-right",
                  ],
                },
                font: { type: "string", enum: [...BRAND_FONTS] },
                color: {
                  type: "string",
                  description: "Hex colour as #rrggbb.",
                },
                widthFrac: {
                  type: "number",
                  description:
                    "Fraction of frame width the block spans, 0.2 to 0.9.",
                },
                scrim: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
  strict: true,
};

const SYSTEM = `You are reviewing a finished video advert as an outside viewer
who has never seen the brief and has no stake in it. You are shown still frames
in time order, labelled with their timestamp.

Judge it the way a stranger scrolling past would:
- Is it obvious what this is FOR within the first two seconds?
- Does anything important sit where the platform draws its own UI over it?
- Is every word legible against what is behind it?
- Does a brand mark appear early enough to be associated with the product?
- Is there a reason to do anything at the end?
- Is there a stretch where nothing changes?

Rules that matter more than being thorough:

REPORT ONLY WHAT YOU CAN SEE. You have still frames, not motion and not audio.
Never claim something about pacing you cannot see in the frames you were given,
and never guess at a voiceover or music. If the frames don't support a note,
leave it out — a short honest review beats a padded one.

AT MOST 6 NOTES, ordered by how much they cost the ad. Three real problems are
more useful than six padded ones. Returning one note, or none, is a valid
answer for a good ad.

PROPOSE AN OVERLAY ONLY WHEN ADDING TEXT ACTUALLY FIXES THE PROBLEM. A pacing
issue or a missing brand mark is not solved by a banner. Inventing an overlay
so a note feels actionable makes the ad worse.

WHEN YOU DO PROPOSE COPY, WRITE IT AS AN AD, NOT A DESCRIPTION. Short, concrete,
in the brand's voice. Never describe the image back to the viewer.

CONFIDENCE IS A PROMISE. Mark a note "high" only if you would stake the ad on
it — high-confidence overlays get applied automatically for approval. Anything
you are inferring rather than seeing is "medium" or "low".`;

/**
 * Watch a finished ad and report what an outside viewer would notice.
 *
 * Opus 5 rather than the cheaper model the Words tool uses: this call decides
 * what goes on a business's advert and its output is applied for approval, so
 * judgement quality is the whole product. A weak critique is worse than none —
 * it costs a render and an approval round trip and teaches the user to ignore
 * the feature.
 */
export async function watchAd(input: AdWatchInput): Promise<AdWatchResult> {
  if (input.frames.length === 0) {
    throw new Error("Could not read any frames from this video.");
  }

  const content: Anthropic.ContentBlockParam[] = [];
  for (const f of input.frames) {
    content.push({ type: "text", text: `Frame at ${f.atSec.toFixed(1)}s:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: f.base64 },
    });
  }
  content.push({
    type: "text",
    text: [
      `The ad is ${input.durationSec.toFixed(1)}s long.`,
      `It will be published to: ${input.platforms.join(", ") || "unspecified"}.`,
      `The brief it was made from: ${input.brief || "(none given)"}`,
      input.caption ? `The caption going out with it: ${input.caption}` : "",
      input.existingText.length
        ? `Text ALREADY on the ad — do not propose these again: ${input.existingText.join(" | ")}`
        : "There is no text on the ad yet.",
      input.steer
        ? `THE USER HAS SUPPLIED THE WORDING THEY WANT: "${input.steer}"\n` +
          `Use it verbatim as the text of any overlay you propose — place and ` +
          `style it, do not rewrite it, and do not invent alternative copy.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const message = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    tools: [WATCH_TOOL],
    tool_choice: { type: "tool", name: "report_ad_notes" },
    messages: [{ role: "user", content }],
  });

  const call = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!call) throw new Error("The watcher returned no notes.");

  // Zod is where the LIMITS live, not the tool schema: strict tool schemas
  // reject JSON-Schema constraint keywords (maxItems, maxLength, pattern,
  // minimum), so those moved into the field descriptions and the real
  // enforcement happens here — which is the better split anyway, since Zod
  // guards against a future API change too, not only against the model.
  //
  // Count is trimmed rather than rejected. The model is told "at most 6"; if
  // it returns seven, failing the whole review and refunding would punish the
  // user for a limit they never saw. Shape violations still throw — a bad hex
  // colour reaches an FFmpeg filtergraph and must not pass.
  const raw = call.input as { working?: unknown; notes?: unknown };
  return adWatchResultSchema.parse({
    working: raw.working,
    notes: Array.isArray(raw.notes) ? raw.notes.slice(0, 6) : [],
  });
}
