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
  const result = await (fal.queue.submit as Submit)(endpoint, {
    input,
    webhookUrl,
  });
  return { requestId: result.request_id };
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
