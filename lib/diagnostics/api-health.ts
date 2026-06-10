import { serverPublicEnv } from "@/lib/env/public-server";

export interface ServiceHealth {
  service: string;
  configured: boolean;
  valid: boolean;
  latencyMs: number | null;
  error: string | null;
}

async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ result?: T; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkFal(): Promise<ServiceHealth> {
  const key = process.env.FAL_API_KEY ?? "";
  if (!key)
    return {
      service: "fal.ai",
      configured: false,
      valid: false,
      latencyMs: null,
      error: "FAL_API_KEY not set",
    };
  if (!/^[0-9a-f-]+:[0-9a-f]+$/i.test(key)) {
    return {
      service: "fal.ai",
      configured: true,
      valid: false,
      latencyMs: null,
      error: "FAL_API_KEY format invalid (expected uuid:secret)",
    };
  }

  const { latencyMs, error } = await timed(() =>
    fetch("https://rest.alpha.fal.ai/v1/queue/requests?limit=1", {
      headers: { Authorization: `Key ${key}` },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
  );

  return {
    service: "fal.ai",
    configured: true,
    valid: !error,
    latencyMs,
    error: error ?? null,
  };
}

async function checkAnthropic(): Promise<ServiceHealth> {
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  if (!key)
    return {
      service: "anthropic",
      configured: false,
      valid: false,
      latencyMs: null,
      error: "ANTHROPIC_API_KEY not set",
    };
  if (!key.startsWith("sk-ant-")) {
    return {
      service: "anthropic",
      configured: true,
      valid: false,
      latencyMs: null,
      error: "ANTHROPIC_API_KEY format invalid (expected sk-ant-...)",
    };
  }

  const { latencyMs, error } = await timed(() =>
    fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
  );

  return {
    service: "anthropic",
    configured: true,
    valid: !error,
    latencyMs,
    error: error ?? null,
  };
}

async function checkSupabase(): Promise<ServiceHealth> {
  const url = serverPublicEnv().supabaseUrl;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    return {
      service: "supabase",
      configured: false,
      valid: false,
      latencyMs: null,
      error: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
    };
  }

  const { latencyMs, error } = await timed(() =>
    fetch(`${url}/rest/v1/workspaces?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
  );

  return {
    service: "supabase",
    configured: true,
    valid: !error,
    latencyMs,
    error: error ?? null,
  };
}

async function checkStripe(): Promise<ServiceHealth> {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key)
    return {
      service: "stripe",
      configured: false,
      valid: false,
      latencyMs: null,
      error: "STRIPE_SECRET_KEY not set",
    };
  if (!key.startsWith("sk_")) {
    return {
      service: "stripe",
      configured: true,
      valid: false,
      latencyMs: null,
      error: "STRIPE_SECRET_KEY format invalid (expected sk_live_ or sk_test_)",
    };
  }

  const { latencyMs, error } = await timed(() =>
    fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
  );

  return {
    service: "stripe",
    configured: true,
    valid: !error,
    latencyMs,
    error: error ?? null,
  };
}

async function checkAyrshare(): Promise<ServiceHealth> {
  const key = process.env.AYRSHARE_API_KEY ?? "";
  if (!key)
    return {
      service: "ayrshare",
      configured: false,
      valid: false,
      latencyMs: null,
      error: "AYRSHARE_API_KEY not set",
    };

  const { latencyMs, error } = await timed(() =>
    fetch("https://app.ayrshare.com/api/user", {
      headers: { Authorization: `Bearer ${key}` },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
  );

  return {
    service: "ayrshare",
    configured: true,
    valid: !error,
    latencyMs,
    error: error ?? null,
  };
}

export async function checkAllApiKeys(): Promise<ServiceHealth[]> {
  return Promise.all([
    checkFal(),
    checkAnthropic(),
    checkSupabase(),
    checkStripe(),
    checkAyrshare(),
  ]);
}
