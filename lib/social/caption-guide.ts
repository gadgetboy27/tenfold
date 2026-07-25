// Per-platform character ceilings + the voice each one rewards. Split out of
// lib/claude/adapt-captions.ts (2026-07-26) because that file also does
// `new Anthropic(...)` at module scope — components/studio/PublishCanvas.tsx
// (a "use client" component, statically imported into Studio.tsx, which
// renders on every authenticated page load) imported PLATFORM_GUIDE from
// there just for this data, and since the Anthropic construction is a side
// effect, bundlers can't tree-shake it out of the client bundle. It shipped
// to the browser and threw the SDK's own browser-safety guard on every page
// load, for every user. Keep this file free of any @anthropic-ai/sdk import.
export const PLATFORM_GUIDE: Record<string, { max: number; style: string }> = {
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
