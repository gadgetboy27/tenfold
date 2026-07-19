/**
 * Caption/script model choice — so the user isn't stuck with one voice. Both are
 * Claude models already proven in this codebase (script.ts uses Sonnet;
 * adapt-captions uses Haiku), so both are guaranteed available on our API key.
 * Per-model token rates are carried here for accurate cost telemetry (the credit
 * charge itself is fixed at CREDIT_COSTS.script_generation regardless of model).
 * Refresh alongside the monthly model review.
 */
export interface CaptionModel {
  id: string;
  label: string;
  blurb: string;
  /** Anthropic model id passed to messages.create. */
  model: string;
  inputCostPerM: number;
  outputCostPerM: number;
}

export const DEFAULT_CAPTION_MODEL = "studio";

export const CAPTION_MODELS: CaptionModel[] = [
  {
    id: "studio",
    label: "Studio",
    blurb: "Most polished — best nuance and brand-voice match.",
    model: "claude-sonnet-4-6",
    inputCostPerM: 3.0,
    outputCostPerM: 15.0,
  },
  {
    id: "rapid",
    label: "Rapid",
    blurb: "Fast and punchy — snappier, more casual copy.",
    model: "claude-haiku-4-5-20251001",
    inputCostPerM: 1.0,
    outputCostPerM: 5.0,
  },
];

export function getCaptionModel(id: string | undefined | null): CaptionModel {
  return (
    CAPTION_MODELS.find((m) => m.id === id) ??
    CAPTION_MODELS.find((m) => m.id === DEFAULT_CAPTION_MODEL)!
  );
}
