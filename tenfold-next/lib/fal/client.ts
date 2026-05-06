import { fal } from '@fal-ai/client';

export function getConfiguredFal() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY is not configured');
  fal.config({ credentials: key });
  return fal;
}
