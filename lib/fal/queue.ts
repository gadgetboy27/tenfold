import { fal } from "./client";
import { FAL_MODELS, type FalModelKey } from "./models";

type Submit = (
  endpointId: string,
  opts: { input: unknown; webhookUrl: string },
) => Promise<{ request_id: string }>;

async function submitToEndpoint(
  endpoint: string,
  input: Record<string, unknown>,
  webhookUrl: string,
): Promise<{ requestId: string }> {
  try {
    const result = await (fal.queue.submit as Submit)(endpoint, {
      input,
      webhookUrl,
    });
    return { requestId: result.request_id };
  } catch (err) {
    // The fal client throws a bare "Unexpected status code: 422" and hides the
    // validation detail on `.body`. Surface it so job.error_message tells us
    // WHAT fal rejected instead of just the status.
    const e = err as { status?: number; body?: unknown; message?: string };
    let detail = "";
    try {
      detail =
        typeof e.body === "string"
          ? e.body
          : e.body
            ? JSON.stringify(e.body)
            : "";
    } catch {
      /* body wasn't serialisable */
    }
    throw new Error(
      [
        `fal ${endpoint}`,
        e.status ? `HTTP ${e.status}` : "",
        detail || e.message,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 600),
    );
  }
}

export async function enqueueJob(
  modelKey: FalModelKey,
  input: Record<string, unknown>,
  webhookUrl: string,
): Promise<{ requestId: string }> {
  return submitToEndpoint(FAL_MODELS[modelKey], input, webhookUrl);
}

/**
 * Submit to a fal endpoint with strategic fallback: try each endpoint in order
 * until one accepts the job. Used for image generation so that if the chosen
 * model's endpoint hard-fails at submit (fal queue error / bad call), we
 * transparently fall through to a more reliable model rather than failing the
 * whole campaign. Returns which endpoint actually accepted it.
 */
export async function enqueueWithFallback(
  endpoints: string[],
  input: Record<string, unknown>,
  webhookUrl: string,
): Promise<{ requestId: string; endpoint: string }> {
  let lastErr: unknown;
  for (const endpoint of endpoints) {
    try {
      const { requestId } = await submitToEndpoint(endpoint, input, webhookUrl);
      return { requestId, endpoint };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("All fal endpoints failed to accept the job");
}

/**
 * Like enqueueWithFallback, but each attempt carries its OWN input — needed when
 * falling back across models with different input schemas (e.g. music models).
 */
export async function enqueueFirstOf(
  attempts: { endpoint: string; input: Record<string, unknown> }[],
  webhookUrl: string,
): Promise<{ requestId: string; endpoint: string }> {
  let lastErr: unknown;
  for (const a of attempts) {
    try {
      const { requestId } = await submitToEndpoint(
        a.endpoint,
        a.input,
        webhookUrl,
      );
      return { requestId, endpoint: a.endpoint };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("All fal endpoints failed to accept the job");
}
