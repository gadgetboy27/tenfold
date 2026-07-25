import type { ProviderAdapter } from "./types";
import { falAdapter } from "./fal-adapter";

const PROVIDERS: Record<string, ProviderAdapter> = {
  fal: falAdapter,
};

/**
 * Per-endpoint provider override — the "single config change" swap path.
 * Empty by default: every endpoint routes to fal unless listed here. To move
 * an endpoint once a second adapter actually exists (none does yet — see
 * lib/fal/CLAUDE.md), add its entry — e.g. `"fal-ai/flux-pro": "replicate"`
 * — and register that adapter in PROVIDERS above. Nothing else changes.
 */
const PROVIDER_FOR_ENDPOINT: Record<string, string> = {};

export function resolveProvider(endpoint: string): ProviderAdapter {
  const id = PROVIDER_FOR_ENDPOINT[endpoint] ?? "fal";
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(
      `No provider registered for id "${id}" (endpoint ${endpoint})`,
    );
  }
  return provider;
}
