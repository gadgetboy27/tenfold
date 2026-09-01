import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  FAL_API_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_PRICE_25CR: z.string().min(1),
  STRIPE_PRICE_100CR: z.string().min(1),
  STRIPE_PRICE_300CR: z.string().min(1),
  STRIPE_PRICE_CREATOR_MONTHLY: z.string().min(1),
  STRIPE_PRICE_BUSINESS_MONTHLY: z.string().min(1),
  STRIPE_PRICE_AGENCY_MONTHLY: z.string().min(1),
  // Encryption at rest for stored OAuth credentials (ISSUES.md #38).
  //
  // OPTIONAL, and that is a deliberate choice rather than laziness. Making it
  // required would mean a deployment that hasn't set it refuses to boot — so a
  // missing key takes the whole product down instead of degrading one feature.
  // Absent, lib/social/token-crypto.ts stores tokens exactly as it did before
  // encryption existed and reads keep working; present, it encrypts on write
  // and decrypts on read, and existing plaintext rows keep working throughout.
  //
  // 32 bytes, base64 (`openssl rand -base64 32`). Lose it and every stored
  // credential becomes undecryptable and every customer must reconnect — which
  // is why it belongs in the platform secret store and nowhere else.
  SOCIAL_TOKEN_KEY: z.string().min(32).optional(),
  // Ayrshare is now opt-in: the integration is kept intact but stays dark
  // unless AYRSHARE_ENABLED === "true", so a deployment that isn't paying for
  // the subscription must be able to boot without the key. Publishing falls
  // back to the Meta and direct backends (lib/social/direct/).
  AYRSHARE_ENABLED: z.enum(["true", "false"]).optional(),
  AYRSHARE_API_KEY: z.string().min(1).optional(),
  // Direct backend (lib/social/direct/). Bluesky needs no app credentials at
  // all — the user supplies an app password — which is why it has no entry.
  REDDIT_CLIENT_ID: z.string().min(1).optional(),
  REDDIT_CLIENT_SECRET: z.string().min(1).optional(),
  // Optional like the rest: a deployment without a LinkedIn app simply can't
  // offer LinkedIn, and the connect route answers 503 saying so rather than
  // failing boot for everyone who doesn't use it.
  LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
  LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
  TIKTOK_CLIENT_KEY: z.string().min(1).optional(),
  TIKTOK_CLIENT_SECRET: z.string().min(1).optional(),
  YOUTUBE_CLIENT_ID: z.string().min(1).optional(),
  YOUTUBE_CLIENT_SECRET: z.string().min(1).optional(),
  PINTEREST_APP_ID: z.string().min(1).optional(),
  PINTEREST_APP_SECRET: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  CRON_SECRET: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`prettymuch: missing or invalid env vars: ${missing}`);
  }
  return parsed.data;
}

export const env = validateEnv();
