/**
 * Model adoption gate — how we ride fal's newest models without ever shipping a
 * regression.
 *
 * fal releases new/better models constantly and we want to be at the forefront.
 * But a newer model is NOT automatically an upgrade: it might drop a capability
 * (a shorter max duration, a different input contract) or simply not be better.
 * So a candidate never silently replaces the incumbent — it must clear three
 * rules, encoded here so the check is executable, not a vibe:
 *
 *   1. IT WORKS      — verified to submit + return successfully against fal.
 *   2. IT COVERS     — its capabilities are a superset of the incumbent's
 *                      (same output, ≥ the durations, ⊇ the input contract).
 *   3. IT IMPROVES   — a recorded, concrete win (speed / quality / cost).
 *
 * Only when all three hold may a candidate be promoted to `active`. The former
 * model is never deleted — it's marked `retired` so a revert is one flag flip.
 * This is the monthly model-review discipline in code form.
 */

export type ModelOutput = "image" | "svg" | "video" | "audio";

/** The capability contract a model must satisfy for a given job family. */
export interface ModelCapability {
  /** What the model produces. A replacement must match this exactly. */
  output: ModelOutput;
  /** Discrete durations (seconds) the model can render, if duration applies. */
  durationsSec?: number[];
  /** Input fields the model consumes (e.g. "start_image_url", "prompt"). */
  input: string[];
}

export type ModelStatus = "active" | "candidate" | "retired";

/** A registered model in a job family, with its status and evaluation record. */
export interface ModelEntry {
  id: string;
  endpoint: string;
  capability: ModelCapability;
  status: ModelStatus;
  /** The active model this candidate/retiree is measured against, if any. */
  supersedes?: string;
  /** ISO date a live submit+return smoke test last passed. Rule 1. */
  verifiedWorkingAt?: string;
  /** One concrete, measured win over the incumbent. Rule 3. */
  improvement?: string;
}

export interface CoverageResult {
  ok: boolean;
  /** Human-readable capability gaps — empty when the candidate covers. */
  gaps: string[];
}

/**
 * Rule 2 — does `candidate` cover everything `incumbent` can do? A candidate
 * covers the incumbent iff it produces the same output, can render every
 * duration the incumbent could, and accepts every input field it did.
 */
export function coversIncumbent(
  candidate: ModelCapability,
  incumbent: ModelCapability,
): CoverageResult {
  const gaps: string[] = [];

  if (candidate.output !== incumbent.output) {
    gaps.push(`output ${candidate.output} ≠ incumbent ${incumbent.output}`);
  }

  const need = incumbent.durationsSec ?? [];
  const have = new Set(candidate.durationsSec ?? []);
  const missingDurations = need.filter((d) => !have.has(d));
  if (missingDurations.length > 0) {
    gaps.push(`cannot render durations: ${missingDurations.join(", ")}s`);
  }

  const haveInputs = new Set(candidate.input);
  const missingInputs = incumbent.input.filter((f) => !haveInputs.has(f));
  if (missingInputs.length > 0) {
    gaps.push(`missing input fields: ${missingInputs.join(", ")}`);
  }

  return { ok: gaps.length === 0, gaps };
}

export interface PromotionResult {
  ok: boolean;
  /** Why promotion is blocked — empty when the candidate may be promoted. */
  reasons: string[];
}

/**
 * The gate: may `candidate` replace `incumbent`? Enforces all three rules.
 * Returns every failing reason so a reviewer sees exactly what's outstanding.
 */
export function canPromote(
  candidate: ModelEntry,
  incumbent: ModelEntry,
): PromotionResult {
  const reasons: string[] = [];

  // Rule 1 — it works (verified live).
  if (!candidate.verifiedWorkingAt) {
    reasons.push("not verified working against fal (no verifiedWorkingAt)");
  }

  // Rule 2 — it covers the incumbent.
  const coverage = coversIncumbent(candidate.capability, incumbent.capability);
  if (!coverage.ok) {
    reasons.push(`does not cover incumbent — ${coverage.gaps.join("; ")}`);
  }

  // Rule 3 — it improves on the incumbent.
  if (!candidate.improvement?.trim()) {
    reasons.push("no recorded improvement over the incumbent");
  }

  return { ok: reasons.length === 0, reasons };
}
