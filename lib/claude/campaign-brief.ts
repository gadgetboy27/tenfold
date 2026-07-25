import Anthropic from "@anthropic-ai/sdk";
import { SUPPORTED_FONTS, type SupportedFont } from "@/lib/logo/font-list";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface BrandSuggestion {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: SupportedFont;
}

export interface CampaignAngle {
  id: string;
  title: string;
  goal: "awareness" | "conversion" | "engagement" | "retention";
  strategy: string;
  keyMessage: string;
  visualStyle: string;
  imagePrompt: string;
  platforms: string[];
}

export interface CampaignBrief {
  url: string;
  businessSummary: string;
  industry: string;
  targetAudience: string;
  uniqueValueProp: string;
  industryInsights: string;
  campaignAngles: CampaignAngle[];
  suggestedQuestions: string[];
  recommendedPlatforms: string[];
  /**
   * Always present — a plausible brand palette/font guess. The caller
   * (app/api/campaigns/analyze-url/route.ts) only USES this when
   * lib/claude/brand-scrape.ts's deterministic detection came back
   * low-confidence; asking for it unconditionally in this same call keeps
   * the whole "Brand Brain" action at one Claude call, not two.
   */
  brandSuggestion: BrandSuggestion;
}

export interface PageContent {
  title: string;
  description: string;
  headings: string[];
  bodyText: string;
  ogImage?: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function coerceHex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_RE.test(value) ? value : fallback;
}

// Defensive parse — mirrors lib/logo/fonts.ts's coerceFont: never trust the
// model to stay inside the constrained font list or return valid hex.
function coerceBrandSuggestion(value: unknown): BrandSuggestion {
  const v = (value ?? {}) as Partial<Record<keyof BrandSuggestion, unknown>>;
  const fontFamily = SUPPORTED_FONTS.includes(v.fontFamily as SupportedFont)
    ? (v.fontFamily as SupportedFont)
    : "Inter";
  return {
    primaryColor: coerceHex(v.primaryColor, "#6366f1"),
    secondaryColor: coerceHex(v.secondaryColor, "#8b5cf6"),
    accentColor: coerceHex(v.accentColor, "#f59e0b"),
    fontFamily,
  };
}

export async function analyzeCampaignUrl(
  url: string,
  page: PageContent,
  userNotes: string,
): Promise<CampaignBrief> {
  const headingStr = page.headings.slice(0, 12).join(" · ");
  const notesSection = userNotes.trim()
    ? `\n\nAdditional context from the client: "${userNotes.trim()}"`
    : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    // 2048 was already tight for 4 detailed campaign angles; adding
    // brandSuggestion (2026-07-26) pushed real responses past it — confirmed
    // live via message.stop_reason === "max_tokens", truncating mid-JSON and
    // failing JSON.parse with a cryptic "Expected ',' or ']'" error. Bumped
    // with real headroom; Anthropic bills actual tokens generated, not this
    // ceiling, so raising it has no cost unless genuinely needed.
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a senior marketing strategist with expertise in digital advertising, brand positioning, and social media campaigns. Analyze this website and produce a comprehensive marketing campaign brief.

Website URL: ${url}
Page title: ${page.title}
Meta description: ${page.description}
Key headings found: ${headingStr || "none"}
Page content excerpt:
---
${page.bodyText.slice(0, 2500)}
---${notesSection}

Using the above content AND your deep knowledge of this industry — including typical competitors, market dynamics, content that resonates with the audience, and platform-specific best practices — create a marketing brief.

Return ONLY valid JSON with no extra text, markdown or code blocks:
{
  "businessSummary": "2-3 sentence plain-English summary of what this business does and who it serves",
  "industry": "e.g. SaaS, E-commerce, Healthcare, Real Estate, etc.",
  "targetAudience": "Primary audience (demographics, job roles, pain points) and secondary audience if relevant",
  "uniqueValueProp": "Their single strongest differentiator in one sentence",
  "industryInsights": "2-3 sentences on the competitive landscape, market trends, and what campaigns are working well in this space right now",
  "campaignAngles": [
    {
      "id": "awareness",
      "title": "Short angle title (4-6 words)",
      "goal": "awareness",
      "strategy": "2-3 sentences: what this campaign does, why it works for this brand, what emotion or action it targets",
      "keyMessage": "The single core message a viewer should take away",
      "visualStyle": "Detailed visual direction: lighting, colour palette, subject matter, composition, mood — enough to prompt an image generator",
      "imagePrompt": "A complete, production-ready prompt for FLUX Pro image generation that captures this angle visually. Include subject, setting, style, lighting, mood. ~60 words.",
      "platforms": ["instagram", "linkedin"]
    }
  ],
  "suggestedQuestions": [
    "What is the primary goal — brand awareness, lead generation, or direct sales?",
    "Do you have a seasonal offer, launch event or promotion to highlight?",
    "Is there a specific geography or demographic segment to prioritise?",
    "What budget level are you working with — startup, growth, or enterprise scale?"
  ],
  "recommendedPlatforms": ["instagram", "linkedin"],
  "brandSuggestion": {
    "primaryColor": "#hex — a plausible brand primary color for this business, based on its industry/tone",
    "secondaryColor": "#hex",
    "accentColor": "#hex",
    "fontFamily": "one of: ${SUPPORTED_FONTS.join(", ")} — whichever best fits the brand's tone"
  }
}

Provide exactly 4 campaign angles covering different goals: awareness, conversion, engagement, and one wild-card creative angle suited to this specific brand. Each imagePrompt must be visually specific and different — not generic stock-photo descriptions. Think like a creative director. brandSuggestion is always required — a best-guess brand palette/font is more useful than nothing, even from your reasoning alone.`,
      },
    ],
  });

  // Defensive check for the exact failure mode that shipped 2026-07-26:
  // hitting max_tokens truncates mid-JSON, and JSON.parse below would throw
  // a cryptic "Expected ',' or ']'" instead of something actionable.
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "The site analysis was too long to complete — try a shorter/simpler page.",
    );
  }

  const block = message.content[0];
  if (block.type !== "text")
    throw new Error(
      "The site analysis didn't return a result — please try again.",
    );

  const match = block.text.match(/\{[\s\S]*\}/);
  if (!match)
    throw new Error(
      "We couldn't read the site analysis properly. Please try again.",
    );

  let parsed: Omit<CampaignBrief, "url">;
  try {
    parsed = JSON.parse(match[0]) as Omit<CampaignBrief, "url">;
  } catch {
    throw new Error(
      "We couldn't read the site analysis properly. Please try again.",
    );
  }
  return {
    ...parsed,
    url,
    brandSuggestion: coerceBrandSuggestion(parsed.brandSuggestion),
  };
}
