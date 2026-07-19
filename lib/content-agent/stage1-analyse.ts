import Anthropic from "@anthropic-ai/sdk";
import { AnalysisOutput } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeTranscript(
  transcript: string,
): Promise<AnalysisOutput> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Analyze this content transcript and extract key information for repurposing across social media.

TRANSCRIPT:
---
${transcript}
---

Return ONLY valid JSON with no extra text, markdown or code blocks:
{
  "mainTopic": "The core subject or primary theme in one sentence",
  "keyInsights": [
    "First most valuable insight from the content",
    "Second insight",
    "Third insight",
    "Fourth insight",
    "Fifth insight"
  ],
  "targetAudience": "Who would find this content most valuable (demographics, interests, job roles)",
  "tone": "professional | casual | educational | entertaining",
  "hooks": [
    "Attention-grabbing opening for short-form content (hook 1)",
    "Alternative hook emphasizing the most surprising element",
    "Hook focusing on practical value",
    "Hook emphasizing emotional benefit",
    "Hook with a question that intrigues",
    "Hook with a bold statement or contrarian take",
    "Hook using pattern interruption or surprise",
    "Hook focusing on transformation or improvement",
    "Hook with curiosity gap",
    "Hook emphasizing credibility or authority"
  ]
}

Ensure:
- keyInsights array has exactly 5 non-empty strings
- hooks array has exactly 10 non-empty, distinct strings
- tone is one of: professional, casual, educational, entertaining
- mainTopic is concise and specific to the actual content`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("No text response from Claude");

  const match = block.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse JSON from Claude response");

  const parsed = JSON.parse(match[0]) as AnalysisOutput;

  if (!Array.isArray(parsed.keyInsights) || parsed.keyInsights.length !== 5) {
    throw new Error("Analysis must include exactly 5 keyInsights");
  }
  if (!Array.isArray(parsed.hooks) || parsed.hooks.length !== 10) {
    throw new Error("Analysis must include exactly 10 hooks");
  }
  if (
    !["professional", "casual", "educational", "entertaining"].includes(
      parsed.tone,
    )
  ) {
    throw new Error(
      "Tone must be one of: professional, casual, educational, entertaining",
    );
  }

  return parsed;
}
