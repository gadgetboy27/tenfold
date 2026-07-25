import { FAL_MODELS, type FalModelKey } from "./models";
import { resolveProvider } from "@/lib/providers/router";

// Submission routes through the provider abstraction (lib/providers/) so a
// future non-fal provider is a config change there, not here — see
// lib/providers/types.ts for what that boundary does and doesn't cover.
async function submitToEndpoint(
  endpoint: string,
  input: Record<string, unknown>,
  webhookUrl: string,
): Promise<{ requestId: string }> {
  return resolveProvider(endpoint).submit(endpoint, input, webhookUrl);
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
