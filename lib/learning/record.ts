import type { ScopedClient } from "@/lib/api/with-workspace";

/**
 * Records how people work — never what they make.
 *
 * The distinction is the whole point. Knowing that someone regenerated three
 * times before picking the fourth image, then skipped music and went straight
 * to publish, tells us how to make the product smarter. Knowing what their ad
 * *said* tells us nothing useful and makes us custodians of their creative
 * work, which is a promise we shouldn't take on casually — the marketing
 * copy says their content is theirs, and hoovering it into an analytics table
 * would sit badly against that even where the terms technically allow it.
 *
 * So the payload is structurally constrained: numbers, booleans, and short
 * enum-ish tokens. `sanitise()` drops anything else rather than truncating it,
 * because a truncated prompt is still a prompt.
 *
 * Fire-and-forget by design. A failed insert must never surface to the user or
 * slow a generation — losing an analytics row is free, losing a campaign isn't.
 */

/** Max length for a string value; anything longer is a content leak, not a label. */
const MAX_TOKEN = 40;

export type DecisionPayload = Record<
  string,
  string | number | boolean | string[] | null | undefined
>;

/**
 * Strips anything that could carry user content. Deliberately lossy: values
 * that don't fit the shape are dropped entirely, never trimmed to fit.
 */
export function sanitise(payload: DecisionPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") {
      if (v.length <= MAX_TOKEN && !v.includes(" ")) out[k] = v;
    } else if (Array.isArray(v)) {
      const clean = v.filter(
        (x) =>
          typeof x === "string" && x.length <= MAX_TOKEN && !x.includes(" "),
      );
      if (clean.length) out[k] = clean;
    }
  }
  return out;
}

/**
 * Insert one event. Never throws, never awaited on a user-facing path —
 * call it with `void`.
 */
export async function recordDecision(
  db: ScopedClient,
  workspaceId: string,
  event: string,
  payload: DecisionPayload = {},
): Promise<void> {
  try {
    await db
      .from("decision_events")
      .insert({ workspace_id: workspaceId, event, payload: sanitise(payload) });
  } catch {
    /* analytics must never break the thing it's measuring */
  }
}
