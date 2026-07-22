import {
  canPromote,
  type ModelEntry,
  type PromotionResult,
} from "@/lib/fal/model-adoption";

/**
 * The model ledger — the live record of which fal model is active for each job
 * family, plus any candidates under evaluation and any retired predecessors we
 * keep around for a one-flag revert. Promotion is governed by the rules in
 * `model-adoption.ts`; this file is the data those rules run against, and the
 * artefact updated at the monthly model review.
 *
 * Endpoints here mirror lib/fal/models.ts (the runtime source of truth for what
 * actually gets called). The ledger adds the capability contract + evaluation
 * metadata the runtime registry doesn't need but adoption decisions do.
 */

export interface ModelFamily {
  family: string;
  active: ModelEntry;
  candidates: ModelEntry[];
  retired: ModelEntry[];
}

export const MODEL_LEDGER: ModelFamily[] = [
  {
    family: "image-to-video",
    active: {
      id: "kling-v3-pro",
      endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
      status: "active",
      capability: {
        output: "video",
        // Per-call durations; 30s is composed from 2×15s, not a native length.
        durationsSec: [10, 15],
        input: ["start_image_url", "prompt", "duration", "generate_audio"],
      },
      verifiedWorkingAt: "2026-07-19",
      improvement: "incumbent — cinematic motion, honours 10s & 15s natively",
    },
    candidates: [
      {
        id: "veo-3.1-fast",
        endpoint: "fal-ai/veo3.1/fast/image-to-video",
        status: "candidate",
        supersedes: "kling-v3-pro",
        capability: {
          output: "video",
          // Veo Fast caps at ~8s — this is the gap the gate will catch.
          durationsSec: [8],
          input: ["image_url", "prompt", "duration", "generate_audio"],
        },
        // Faster, but NOT verified to cover our 15s contract — deliberately
        // left un-promoted. The gate below explains exactly why.
        improvement: "faster renders (~8s clips) at strong realism",
      },
    ],
    retired: [],
  },
];

export interface FamilyPromotionReport {
  family: string;
  candidateId: string;
  decision: PromotionResult;
}

/**
 * Run the adoption gate across every candidate in the ledger. Use this at the
 * monthly review (or in a test) to see, in one place, which candidates are
 * clear to promote and which are blocked and why.
 */
export function promotionReport(
  ledger: ModelFamily[] = MODEL_LEDGER,
): FamilyPromotionReport[] {
  const reports: FamilyPromotionReport[] = [];
  for (const fam of ledger) {
    for (const candidate of fam.candidates) {
      reports.push({
        family: fam.family,
        candidateId: candidate.id,
        decision: canPromote(candidate, fam.active),
      });
    }
  }
  return reports;
}
