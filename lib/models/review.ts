import type { SupabaseClient } from "@supabase/supabase-js";
import { VARIETY_IMAGE_MODELS } from "@/lib/fal/models";
import { MUSIC_MODELS } from "@/lib/fal/models";
import { CAPTION_MODELS } from "@/lib/claude/caption-models";

/**
 * Monthly model refresh. The model registries (variety images, music, captions)
 * are curated by hand and go stale as fal.ai / Anthropic ship better models. This
 * assembles a review report — every model we currently offer plus how often users
 * actually pick each variety-pack model — so a human can decide what to swap on
 * the next refresh. Verifying a new endpoint live before wiring it stays a manual
 * step (by design); this just surfaces the signal and the prompt to do it.
 */
export interface ModelReviewReport {
  generatedAt: string;
  imageModels: { id: string; label: string; endpoint: string; picks: number }[];
  musicModels: {
    id: string;
    label: string;
    endpoint: string;
    vocals: boolean;
  }[];
  captionModels: { id: string; label: string; model: string }[];
  totalVarietyPicks: number;
}

export async function buildModelReviewReport(
  admin: SupabaseClient,
): Promise<ModelReviewReport> {
  const picksByModel = new Map<string, number>();
  try {
    const { data } = await admin.rpc("variety_model_popularity");
    for (const row of (data ?? []) as { model: string; picks: number }[]) {
      picksByModel.set(row.model, Number(row.picks) || 0);
    }
  } catch {
    // popularity is best-effort — a report with zeroes is still useful
  }

  const imageModels = VARIETY_IMAGE_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    endpoint: m.endpoint,
    picks: picksByModel.get(m.id) ?? 0,
  }));

  return {
    generatedAt: new Date().toISOString(),
    imageModels,
    musicModels: MUSIC_MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      endpoint: m.endpoint,
      vocals: m.vocals ?? false,
    })),
    captionModels: CAPTION_MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      model: m.model,
    })),
    totalVarietyPicks: imageModels.reduce((sum, m) => sum + m.picks, 0),
  };
}

function renderReviewHtml(report: ModelReviewReport): string {
  const imgRows = [...report.imageModels]
    .sort((a, b) => b.picks - a.picks)
    .map(
      (m) =>
        `<tr><td>${m.label}</td><td><code>${m.endpoint}</code></td><td>${m.picks}</td></tr>`,
    )
    .join("");
  const musicRows = report.musicModels
    .map(
      (m) =>
        `<tr><td>${m.label}${m.vocals ? " (vocals)" : ""}</td><td><code>${m.endpoint}</code></td></tr>`,
    )
    .join("");
  const captionRows = report.captionModels
    .map((m) => `<tr><td>${m.label}</td><td><code>${m.model}</code></td></tr>`)
    .join("");

  return `
<h1>Tenfold — Monthly Model Review</h1>
<p>Generated ${report.generatedAt}. Check fal.ai / Anthropic for newer models and
refresh the registries (<code>lib/fal/models.ts</code>,
<code>lib/claude/caption-models.ts</code>) — verify any new endpoint live first.</p>

<h2>Image variety models — ${report.totalVarietyPicks} total picks</h2>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Model</th><th>Endpoint</th><th>Picks</th></tr>
${imgRows}
</table>

<h2>Music models</h2>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Model</th><th>Endpoint</th></tr>
${musicRows}
</table>

<h2>Caption models</h2>
<table border="1" cellpadding="6" cellspacing="0">
<tr><th>Model</th><th>Engine</th></tr>
${captionRows}
</table>
`;
}

/**
 * Email the review to the operator. No-ops (returns false) if Resend or the
 * recipient address isn't configured — the cron still returns the JSON report.
 */
export async function sendModelReviewEmail(
  report: ModelReviewReport,
): Promise<boolean> {
  const to = process.env.MODEL_REVIEW_EMAIL;
  if (!process.env.RESEND_API_KEY || !to) return false;

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: "models@tenfold.nz",
    to,
    subject: "Tenfold — Monthly Model Review",
    html: renderReviewHtml(report),
  });
  return true;
}
