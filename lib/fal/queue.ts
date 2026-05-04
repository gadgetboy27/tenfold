import { fal } from './client';
import { FAL_MODELS, type FalModelKey } from './models';

export async function enqueueJob(
  modelKey: FalModelKey,
  input: Record<string, unknown>,
  webhookUrl: string,
): Promise<{ requestId: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (fal.queue.submit as (endpointId: string, opts: { input: unknown; webhookUrl: string }) => Promise<{ request_id: string }>)(
    FAL_MODELS[modelKey],
    { input, webhookUrl },
  );
  return { requestId: result.request_id };
}
