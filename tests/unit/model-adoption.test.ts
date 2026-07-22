import { describe, it, expect } from "vitest";
import {
  coversIncumbent,
  canPromote,
  type ModelEntry,
} from "@/lib/fal/model-adoption";
import { promotionReport, MODEL_LEDGER } from "@/lib/fal/model-ledger";

const kling: ModelEntry = {
  id: "kling-v3-pro",
  endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
  status: "active",
  capability: {
    output: "video",
    durationsSec: [10, 15],
    input: ["start_image_url", "prompt", "duration", "generate_audio"],
  },
  verifiedWorkingAt: "2026-07-19",
  improvement: "incumbent",
};

describe("coversIncumbent (rule 2)", () => {
  it("passes when the candidate matches output, durations and inputs", () => {
    const twin = { ...kling.capability };
    expect(coversIncumbent(twin, kling.capability).ok).toBe(true);
  });

  it("fails when the candidate drops a duration the incumbent had", () => {
    const veoCap = {
      output: "video" as const,
      durationsSec: [8],
      input: ["image_url", "prompt", "duration", "generate_audio"],
    };
    const res = coversIncumbent(veoCap, kling.capability);
    expect(res.ok).toBe(false);
    expect(res.gaps.join(" ")).toContain("10, 15");
  });

  it("fails when the output type differs", () => {
    const res = coversIncumbent(
      { output: "image", input: ["prompt"] },
      { output: "video", input: ["prompt"] },
    );
    expect(res.ok).toBe(false);
  });

  it("fails when an input field is missing", () => {
    const res = coversIncumbent(
      { output: "video", durationsSec: [10, 15], input: ["prompt"] },
      kling.capability,
    );
    expect(res.ok).toBe(false);
    expect(res.gaps.join(" ")).toContain("start_image_url");
  });
});

describe("canPromote (the full gate)", () => {
  it("blocks a candidate that isn't verified working", () => {
    const cand: ModelEntry = {
      ...kling,
      id: "x",
      verifiedWorkingAt: undefined,
    };
    expect(canPromote(cand, kling).ok).toBe(false);
  });

  it("blocks a candidate with no recorded improvement", () => {
    const cand: ModelEntry = { ...kling, id: "x", improvement: "" };
    expect(canPromote(cand, kling).ok).toBe(false);
  });

  it("promotes only when it works, covers AND improves", () => {
    const cand: ModelEntry = {
      ...kling,
      id: "kling-v4",
      improvement: "sharper motion, same durations",
    };
    expect(canPromote(cand, kling).ok).toBe(true);
  });
});

describe("live ledger", () => {
  it("keeps Veo 3.1 Fast blocked from replacing Kling (can't cover 15s)", () => {
    const report = promotionReport(MODEL_LEDGER);
    const veo = report.find((r) => r.candidateId === "veo-3.1-fast");
    expect(veo?.decision.ok).toBe(false);
    expect(veo?.decision.reasons.join(" ")).toContain("cover");
  });
});
