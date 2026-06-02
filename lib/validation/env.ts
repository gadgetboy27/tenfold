import { z } from 'zod';

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
  AYRSHARE_API_KEY: z.string().min(1),
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
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`tenfold: missing or invalid env vars: ${missing}`);
  }
  return parsed.data;
}

export const env = validateEnv();
