import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

interface PromptDimension {
  subject: number;
  setting: number;
  style: number;
  mood: number;
  lighting: number;
}

interface PromptAnalysisResult {
  score: number;
  ready: boolean;
  dimensions: PromptDimension;
  missing: string[];
  questions: string[];
  enhanced: string;
  model: "rule-based" | "claude";
}

/**
 * Rule-based fallback analysis — works with no AI key.
 * Produces consistent results based on keyword presence.
 */
function ruleBasedAnalysis(
  prompt: string,
  intendedOutputs: string[]
): PromptAnalysisResult {
  const text = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;

  const SUBJECT_WORDS = [
    "person", "woman", "man", "founder", "ceo", "team", "product", "building",
    "landscape", "brand", "group", "professional", "executive", "speaker",
    "athlete", "model", "entrepreneur", "leader", "character", "figure",
  ];
  const SETTING_WORDS = [
    "office", "outdoor", "studio", "conference", "city", "stage", "room",
    "street", "nature", "indoor", "urban", "rooftop", "boardroom", "warehouse",
    "loft", "park", "hotel", "restaurant", "gym", "desk", "lab", "showroom",
  ];
  const STYLE_WORDS = [
    "cinematic", "professional", "editorial", "minimal", "bold", "warm",
    "dark", "bright", "moody", "photorealistic", "vibrant", "muted", "soft",
    "commercial", "magazine", "hyper-realistic", "film", "documentary",
  ];
  const MOOD_WORDS = [
    "inspiring", "exciting", "calm", "energetic", "confident", "aspirational",
    "premium", "dynamic", "powerful", "elegant", "luxurious", "playful",
    "serious", "hopeful", "ambitious", "authentic", "emotional", "dramatic",
  ];
  const LIGHTING_WORDS = [
    "golden hour", "backlit", "rim light", "soft light", "studio lighting",
    "natural light", "neon", "sunset", "dawn", "blue hour", "overcast",
    "spotlight", "ambient", "high contrast", "silhouette",
  ];

  const hasSubject = SUBJECT_WORDS.some((w) => text.includes(w)) || wordCount >= 8;
  const hasSetting = SETTING_WORDS.some((w) => text.includes(w));
  const hasStyle   = STYLE_WORDS.some((w) => text.includes(w));
  const hasMood    = MOOD_WORDS.some((w) => text.includes(w));
  const hasLighting = LIGHTING_WORDS.some((w) => text.includes(w));

  const dimensions: PromptDimension = {
    subject:  hasSubject  ? 90 : wordCount >= 5 ? 30 : 0,
    setting:  hasSetting  ? 90 : 0,
    style:    hasStyle    ? 90 : 0,
    mood:     hasMood     ? 90 : 0,
    lighting: hasLighting ? 90 : 0,
  };

  const score = Math.min(
    100,
    Math.round(
      (dimensions.subject  * 0.28) +
      (dimensions.setting  * 0.22) +
      (dimensions.style    * 0.20) +
      (dimensions.mood     * 0.18) +
      (dimensions.lighting * 0.12)
    )
  );

  const missing: string[] = [];
  if (!hasSubject) missing.push("Main subject not specified");
  if (!hasSetting) missing.push("Location or setting unclear");
  if (!hasStyle)   missing.push("Visual style not defined");
  if (!hasMood)    missing.push("Tone or emotion missing");
  if (!hasLighting) missing.push("Lighting not described");

  const questions: string[] = [];
  if (!hasSubject) questions.push("Who or what is the main subject — a person, product, or scene?");
  if (!hasSetting) questions.push("Where does this take place — office, outdoor, studio, city?");
  if (!hasMood)    questions.push("What feeling should this create — confident, aspirational, dramatic?");
  if (!hasLighting) questions.push("What lighting — golden hour, studio, natural, neon?");
  if (intendedOutputs.includes("video") && !hasMood)
    questions.push("For video: what action or movement happens in the scene?");

  const additions: string[] = [];
  if (!hasSetting)  additions.push("in a modern professional setting");
  if (!hasStyle)    additions.push("cinematic composition");
  if (!hasMood)     additions.push("aspirational and confident");
  if (!hasLighting) additions.push("golden hour lighting");

  const enhanced =
    additions.length > 0
      ? `${prompt}, ${additions.join(", ")}, ultra-high quality`
      : prompt;

  return {
    score,
    ready: score >= 60,
    dimensions,
    missing,
    questions: questions.slice(0, 3),
    enhanced,
    model: "rule-based",
  };
}

/**
 * POST /api/prompt/analyze
 *
 * Analyzes a user prompt for quality and completeness.
 * Uses Claude when ANTHROPIC_API_KEY is set; falls back to rule-based scoring.
 *
 * TODO (real Claude implementation):
 *   import Anthropic from "@anthropic-ai/sdk";
 *   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 *
 *   const systemPrompt = `You are a creative director reviewing image generation prompts
 *   for professional marketing content. Score this prompt on 5 dimensions (0-100 each):
 *   subject clarity, setting/environment, visual style, mood/emotion, lighting.
 *   Return JSON only with keys: score, ready, dimensions, missing, questions, enhanced.`;
 *
 *   const msg = await client.messages.create({
 *     model: "claude-haiku-4-5",  // fast + cheap for real-time analysis
 *     max_tokens: 512,
 *     messages: [{ role: "user", content: `Prompt: "${prompt}"\nOutputs: ${intendedOutputs.join(", ")}` }],
 *     system: systemPrompt,
 *   });
 *   const result = JSON.parse(msg.content[0].text);
 *   res.json({ ...result, model: "claude" });
 */
router.post("/prompt/analyze", requireAuth, (req, res) => {
  const { prompt, intendedOutputs = [] } = req.body as {
    prompt: string;
    intendedOutputs?: string[];
  };

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  if (prompt.trim().split(/\s+/).length < 2) {
    res.json({ score: 0, ready: false, dimensions: {}, missing: [], questions: [], enhanced: prompt, model: "rule-based" });
    return;
  }

  try {
    // When ANTHROPIC_API_KEY is present, replace this with real Claude call (see TODO above)
    const hasAnthropicKey = !!process.env["ANTHROPIC_API_KEY"];
    if (hasAnthropicKey) {
      logger.info("ANTHROPIC_API_KEY is set — Claude analysis not yet wired; falling back to rule-based");
    }

    const result = ruleBasedAnalysis(prompt, intendedOutputs);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Prompt analysis failed");
    res.status(500).json({ error: "Analysis failed" });
  }
});

export default router;
