import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  bigint,
  real,
  jsonb,
  timestamp,
  unique,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── WORKSPACES ──────────────────────────────────────────────────────────────
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: uuid('owner_id').notNull(),
  brandName: text('brand_name'),
  brandLogoUrl: text('brand_logo_url'),
  brandPrimary: text('brand_primary').default('#000000'),
  brandSecondary: text('brand_secondary').default('#FFFFFF'),
  brandFont: text('brand_font').default('Inter'),
  ayrshareProfileKey: text('ayrshare_profile_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── WORKSPACE MEMBERS ────────────────────────────────────────────────────────
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull().default('member'),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.workspaceId, t.userId),
    check('role_check', sql`${t.role} IN ('owner','admin','member')`),
  ],
);

// ─── SOCIAL PROFILES ─────────────────────────────────────────────────────────
export const socialProfiles = pgTable(
  'social_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    handle: text('handle'),
    profileDisplayName: text('profile_display_name'),
    platformPageId: text('platform_page_id'),       // FB Page ID / LinkedIn Company Page ID
    platformAccountId: text('platform_account_id'), // IG Business Account ID
    accessToken: text('access_token'),              // OAuth access token (never null when connected)
    refreshToken: text('refresh_token'),            // OAuth refresh token (null for FB page tokens)
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }), // null = never expires
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.workspaceId, t.platform)],
);

// ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────────
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  tier: text('tier').notNull().default('payg'),
  status: text('status').notNull().default('active'),
  creditsPerPeriod: integer('credits_per_period').notNull().default(0),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── CREDIT ACCOUNTS ─────────────────────────────────────────────────────────
export const creditAccounts = pgTable('credit_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  cachedBalance: integer('cached_balance').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── CREDIT TRANSACTIONS ─────────────────────────────────────────────────────
export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id'), // FK to creative_jobs added via migration
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    description: text('description').notNull(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_credit_transactions_workspace').on(t.workspaceId)],
);

// ─── CAMPAIGNS ───────────────────────────────────────────────────────────────
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').notNull(),
    prompt: text('prompt').notNull(),
    parameters: jsonb('parameters').notNull().default('{}'),
    anchorAssetId: uuid('anchor_asset_id'), // FK added after assets table
    status: text('status').notNull().default('generating'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_campaigns_workspace').on(t.workspaceId),
    index('idx_campaigns_status').on(t.status),
  ],
);

// ─── CREATIVE JOBS ────────────────────────────────────────────────────────────
export const creativeJobs = pgTable(
  'creative_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    status: text('status').notNull().default('queued'),
    falRequestId: text('fal_request_id').unique(),
    inputParams: jsonb('input_params').notNull().default('{}'),
    errorMessage: text('error_message'),
    falRawError: jsonb('fal_raw_error'),
    errorAnalysis: text('error_analysis'),
    suggestedPrompt: text('suggested_prompt'),
    creditsCharged: integer('credits_charged').notNull().default(0),
    actualCostUsd: real('actual_cost_usd'),
    providerDurationMs: integer('provider_duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_creative_jobs_campaign').on(t.campaignId),
    index('idx_creative_jobs_status').on(t.status),
    index('idx_creative_jobs_fal_id').on(t.falRequestId),
  ],
);

// ─── ASSETS ──────────────────────────────────────────────────────────────────
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => creativeJobs.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    url: text('url').notNull(),
    storagePath: text('storage_path').notNull(),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    durationSec: real('duration_sec'),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_assets_campaign').on(t.campaignId),
    index('idx_assets_job').on(t.jobId),
  ],
);

// ─── COMPOSITIONS ─────────────────────────────────────────────────────────────
export const compositions = pgTable('compositions', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  anchorAssetId: uuid('anchor_asset_id')
    .notNull()
    .references(() => assets.id),
  outputAssetId: uuid('output_asset_id').references(() => assets.id),
  format: text('format').notNull().default('square'),
  textOverlays: jsonb('text_overlays').notNull().default('[]'),
  branding: jsonb('branding').notNull().default('{}'),
  caption: text('caption'),
  hashtags: text('hashtags').array(),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── PUBLISH RECORDS ─────────────────────────────────────────────────────────
export const publishRecords = pgTable(
  'publish_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    compositionId: uuid('composition_id')
      .notNull()
      .references(() => compositions.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ayrsharePostId: text('ayrshare_post_id'),
    platforms: text('platforms').array().notNull(),
    caption: text('caption'),
    hashtags: text('hashtags').array(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    status: text('status').notNull().default('pending'),
    platformResults: jsonb('platform_results').notNull().default('{}'),
    analytics: jsonb('analytics').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_publish_records_workspace').on(t.workspaceId),
    index('idx_publish_records_status').on(t.status),
  ],
);

// ─── WEBHOOK LOGS ─────────────────────────────────────────────────────────────
export const webhookLogs = pgTable(
  'webhook_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    eventId: text('event_id').notNull(),
    payload: jsonb('payload').notNull(),
    processed: boolean('processed').notNull().default(false),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.source, t.eventId), index('idx_webhook_logs_event').on(t.source, t.eventId)],
);

// ─── CONTENT AGENT ───────────────────────────────────────────────────────────
export const contentSubmissions = pgTable(
  'content_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').notNull(),
    rawTranscript: text('raw_transcript').notNull(),
    status: text('status').notNull().default('queued'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_content_submissions_workspace').on(t.workspaceId),
    index('idx_content_submissions_status').on(t.status),
  ],
);

export const contentPipelineResults = pgTable(
  'content_pipeline_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => contentSubmissions.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    status: text('status').notNull().default('pending'),
    outputJson: jsonb('output_json'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_content_pipeline_results_submission').on(t.submissionId),
    index('idx_content_pipeline_results_stage').on(t.stage),
  ],
);

export const analyticsReports = pgTable('analytics_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  reportJson: jsonb('report_json').notNull(),
  weekEnding: text('week_ending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
