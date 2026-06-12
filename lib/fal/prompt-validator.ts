import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CreativeDirection {
  /** Short 1-2 word label shown under the thumbnail, e.g. "Wide", "Close-up". */
  label: string;
  /** Full image prompt for this distinct creative angle (same subject/motif). */
  prompt: string;
}

export interface PromptValidation {
  score: number;
  isValid: boolean;
  issues: string[];
  refinedPrompt: string | null;
  /** Exactly 4 contrasting-but-cohesive directions to render as the anchor set. */
  directions: CreativeDirection[];
}

// Hardcoded fallback "lenses" — used when the model omits directions or returns
// an invalid set. Eight genuinely different compositions sharing one subject
// (the first 4 cover the free tier; Pro tiers draw on the full set).
const FALLBACK_LENSES: Array<{ label: string; modifier: string }> = [
  {
    label: "Wide",
    modifier:
      "wide establishing shot, environmental context, generous negative space",
  },
  {
    label: "Close-up",
    modifier: "tight hero close-up, shallow depth of field, intricate detail",
  },
  {
    label: "Flat-lay",
    modifier:
      "overhead flat-lay, clean minimal graphic composition, centered subject",
  },
  {
    label: "Dramatic",
    modifier:
      "bold dynamic angle, dramatic directional lighting, high contrast cinematic mood",
  },
  {
    label: "Macro",
    modifier: "extreme macro detail, razor-thin focus, textural richness",
  },
  {
    label: "Aerial",
    modifier: "high aerial / bird's-eye view, strong geometric composition",
  },
  {
    label: "Lifestyle",
    modifier: "candid lifestyle scene, subject in real use, warm natural light",
  },
  {
    label: "Studio",
    modifier:
      "clean seamless studio backdrop, even soft lighting, product-catalogue look",
  },
];

export function fallbackDirections(
  basePrompt: string,
  count = 4,
): CreativeDirection[] {
  return FALLBACK_LENSES.slice(
    0,
    Math.max(1, Math.min(count, FALLBACK_LENSES.length)),
  ).map((l) => ({
    label: l.label,
    prompt: `${basePrompt}, ${l.modifier}`,
  }));
}

function normalizeDirections(
  raw: unknown,
  basePrompt: string,
  count: number,
): CreativeDirection[] {
  if (Array.isArray(raw)) {
    const cleaned = raw
      .filter(
        (d): d is { label?: unknown; prompt?: unknown } =>
          !!d && typeof d === "object",
      )
      .map((d) => ({
        label: typeof d.label === "string" ? d.label.trim().slice(0, 24) : "",
        prompt: typeof d.prompt === "string" ? d.prompt.trim() : "",
      }))
      .filter((d) => d.label && d.prompt.length >= 5);
    if (cleaned.length >= count) return cleaned.slice(0, count);
    // Model returned some but not enough — top up with fallback lenses.
    if (cleaned.length > 0) {
      const extra = fallbackDirections(basePrompt, count).slice(cleaned.length);
      return [...cleaned, ...extra].slice(0, count);
    }
  }
  return fallbackDirections(basePrompt, count);
}

export async function validatePrompt(
  prompt: string,
  style: string,
  count = 4,
): Promise<PromptValidation> {
  if (!prompt || prompt.trim().length < 5) {
    return {
      score: 0,
      isValid: false,
      issues: ["Prompt is too short — describe a subject, setting, and mood."],
      refinedPrompt: null,
      directions: fallbackDirections(prompt || "a clean product shot", count),
    };
  }

  const styleGuide: Record<string, string> = {
    Photorealistic:
      'needs a clear subject + setting + lighting (e.g. "founder at a tech conference, golden hour backlight, DSLR close-up"). Vague prompts produce muddy photos.',
    Illustration:
      'needs a clear subject + colour mood + art direction (e.g. "bold flat-colour vector of a coffee cup, warm pastels, minimal background"). Abstract prompts produce generic clip-art.',
    Cinematic:
      'needs a scene/moment + mood + lighting direction (e.g. "CEO walking through glass office, dramatic low-key side lighting, wide shot"). Needs enough narrative tension to feel like a movie still.',
    "3D": 'needs a clear object or scene + surface material + lighting environment (e.g. "floating product bottle, matte white with gold accents, studio HDRI"). Abstract prompts produce shapeless geometry.',
  };

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1400,
      messages: [
        {
          role: "user",
          content: `You prepare prompts for FLUX Pro, a photorealistic AI image model. Style requested: ${style}.
Style guidance: ${styleGuide[style] ?? "needs a clear subject, setting, and mood."}
User prompt: "${prompt}"

Do TWO things and return JSON only — no other text:

1) Rate the prompt. Score 0-39 = too vague/will fail, 40-69 = acceptable, 70-100 = strong. Only flag REAL issues (missing subject, too abstract, prohibited content). If score < 70 and an obvious improvement exists, provide refinedPrompt; otherwise null.

2) Produce exactly ${count} "directions": ${count} DISTINCT image prompts that keep the SAME subject, brand and motif but contrast strongly in composition, framing, mood and lighting (so the user has genuinely different options to choose from — not near-duplicates). Each needs a short 1-2 word "label" (e.g. "Wide", "Close-up", "Flat-lay", "Dramatic", "Macro", "Aerial", "Lifestyle", "Studio") and a full "prompt". Tailor the angles to the subject — pick the contrasts that actually make sense for it.

{
  "score": <0-100>,
  "issues": ["<issue if any>"],
  "refinedPrompt": "<improved prompt or null>",
  "directions": [
    {"label": "<1-2 words>", "prompt": "<full distinct image prompt>"}
  ]
}`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      return {
        score: 60,
        isValid: true,
        issues: [],
        refinedPrompt: null,
        directions: fallbackDirections(prompt, count),
      };
    }

    const match = block.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    const parsed = JSON.parse(match[0]) as {
      score?: number;
      issues?: string[];
      refinedPrompt?: string | null;
      directions?: unknown;
    };

    const score = parsed.score ?? 60;
    const base = parsed.refinedPrompt ?? prompt;
    return {
      score,
      isValid: score >= 40,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      refinedPrompt: parsed.refinedPrompt ?? null,
      directions: normalizeDirections(parsed.directions, base, count),
    };
  } catch {
    // On any failure, never block generation — accept and use fallback lenses.
    return {
      score: 60,
      isValid: true,
      issues: [],
      refinedPrompt: null,
      directions: fallbackDirections(prompt, count),
    };
  }
}
