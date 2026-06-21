// Central upsell copy so every locked feature sells the same "here's what you
// get" story. The modal lists PRO_PERKS; each feature just supplies its name +
// a one-liner.

export const PRO_PERKS = [
  "Spokesperson & talking video",
  "Multi-language dubbing",
  "Virtual try-on",
  "Auto-captions & product-in-scene",
  "30s & 60s video, HD exports",
  "Publish to X, LinkedIn, TikTok & more",
];

export interface UpsellCopy {
  feature: string;
  blurb: string;
}

export const UPSELLS = {
  talking_video: {
    feature: "Spokesperson video",
    blurb:
      "Turn a prompt into an on-camera presenter that speaks your ad — in 12 languages.",
  },
  virtual_tryon: {
    feature: "Virtual try-on",
    blurb: "Put your product on a model — no photoshoot needed.",
  },
  auto_caption: {
    feature: "Auto-captions",
    blurb: "Burn in animated subtitles — most people watch on mute.",
  },
  product_shot: {
    feature: "Product in scene",
    blurb: "Drop your product into any lifestyle background.",
  },
} as const satisfies Record<string, UpsellCopy>;
