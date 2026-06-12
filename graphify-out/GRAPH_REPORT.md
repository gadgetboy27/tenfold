# Graph Report - .  (2026-06-10)

## Corpus Check
- 175 files · ~65,378 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1107 nodes · 1751 edges · 89 communities (73 shown, 16 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Content Pipeline & Ayrshare Publishing|Content Pipeline & Ayrshare Publishing]]
- [[_COMMUNITY_Campaign Creation & Script Gen|Campaign Creation & Script Gen]]
- [[_COMMUNITY_Migration Snapshot Foreign Keys|Migration Snapshot: Foreign Keys]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_withWorkspace Routing Layer|withWorkspace Routing Layer]]
- [[_COMMUNITY_creative_jobs Table Schema|creative_jobs Table Schema]]
- [[_COMMUNITY_assets Table Schema|assets Table Schema]]
- [[_COMMUNITY_Auth Session & API Routes|Auth Session & API Routes]]
- [[_COMMUNITY_Migration Snapshot FKs|Migration Snapshot: FKs]]
- [[_COMMUNITY_campaigns Table Schema|campaigns Table Schema]]
- [[_COMMUNITY_Provider Cost & Error Analysis|Provider Cost & Error Analysis]]
- [[_COMMUNITY_Campaign Lobby UI|Campaign Lobby UI]]
- [[_COMMUNITY_Drizzle Schema & DB Client|Drizzle Schema & DB Client]]
- [[_COMMUNITY_Brand Kit & Auth Pages|Brand Kit & Auth Pages]]
- [[_COMMUNITY_Content Agent Pipeline (concepts)|Content Agent Pipeline (concepts)]]
- [[_COMMUNITY_Dashboard UI Shell|Dashboard UI Shell]]
- [[_COMMUNITY_Social Publishing Routes|Social Publishing Routes]]
- [[_COMMUNITY_Migration Snapshot Constraints|Migration Snapshot: Constraints]]
- [[_COMMUNITY_Auth Provisioning & Login|Auth Provisioning & Login]]
- [[_COMMUNITY_Shared Layout & UI|Shared Layout & UI]]
- [[_COMMUNITY_Step Flow Components|Step Flow Components]]
- [[_COMMUNITY_Dev Dependencies & Tooling|Dev Dependencies & Tooling]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Campaign Brief Generation|Campaign Brief Generation]]
- [[_COMMUNITY_TopBar & Radix UI|TopBar & Radix UI]]
- [[_COMMUNITY_Social Connect Checklist UI|Social Connect Checklist UI]]
- [[_COMMUNITY_credit_accounts Table|credit_accounts Table]]
- [[_COMMUNITY_API Health Checks|API Health Checks]]
- [[_COMMUNITY_Migration Column Defs|Migration Column Defs]]
- [[_COMMUNITY_campaigns Columns|campaigns Columns]]
- [[_COMMUNITY_Stripe Checkout|Stripe Checkout]]
- [[_COMMUNITY_Billing Page UI|Billing Page UI]]
- [[_COMMUNITY_Migration Snapshot Metadata|Migration Snapshot Metadata]]
- [[_COMMUNITY_Ayrshare Profiles|Ayrshare Profiles]]
- [[_COMMUNITY_Migration Snapshot FKs|Migration Snapshot: FKs]]
- [[_COMMUNITY_creative_jobs RLS & Constraints|creative_jobs RLS & Constraints]]
- [[_COMMUNITY_Content Submit & Publish|Content Submit & Publish]]
- [[_COMMUNITY_Image Composition Pipeline|Image Composition Pipeline]]
- [[_COMMUNITY_Pipeline Status UI|Pipeline Status UI]]
- [[_COMMUNITY_Migration FKs|Migration FKs]]
- [[_COMMUNITY_creative_jobs Indexes|creative_jobs Indexes]]
- [[_COMMUNITY_Stripe Credit Grants|Stripe Credit Grants]]
- [[_COMMUNITY_Index Defs|Index Defs]]
- [[_COMMUNITY_Index Defs|Index Defs]]
- [[_COMMUNITY_Table RLS & Constraints|Table RLS & Constraints]]
- [[_COMMUNITY_Credit Meter & Job Status UI|Credit Meter & Job Status UI]]
- [[_COMMUNITY_Middleware & CORS Proxy|Middleware & CORS Proxy]]
- [[_COMMUNITY_Brand Kit Route|Brand Kit Route]]
- [[_COMMUNITY_branding Column|branding Column]]
- [[_COMMUNITY_created_at Column|created_at Column]]
- [[_COMMUNITY_format Column|format Column]]
- [[_COMMUNITY_id Column|id Column]]
- [[_COMMUNITY_parameters Column|parameters Column]]
- [[_COMMUNITY_status Column|status Column]]
- [[_COMMUNITY_text_overlays Column|text_overlays Column]]
- [[_COMMUNITY_updated_at Column|updated_at Column]]
- [[_COMMUNITY_Claude Settings Config|Claude Settings Config]]
- [[_COMMUNITY_anchor_asset_id Column|anchor_asset_id Column]]
- [[_COMMUNITY_hashtags Column|hashtags Column]]
- [[_COMMUNITY_output_asset_id Column|output_asset_id Column]]
- [[_COMMUNITY_fal_request_id Unique|fal_request_id Unique]]
- [[_COMMUNITY_Approve All UI|Approve All UI]]
- [[_COMMUNITY_Content Review UI|Content Review UI]]
- [[_COMMUNITY_Migration Journal|Migration Journal]]
- [[_COMMUNITY_Stripe Product Setup|Stripe Product Setup]]
- [[_COMMUNITY_Skeleton Card UI|Skeleton Card UI]]
- [[_COMMUNITY_API Test Script|API Test Script]]
- [[_COMMUNITY_Env Validation (Zod)|Env Validation (Zod)]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Resend Email Route|Resend Email Route]]
- [[_COMMUNITY_Generic UI Icons|Generic UI Icons]]
- [[_COMMUNITY_Project Docs & Rules|Project Docs & Rules]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Supabase MCP Config|Supabase MCP Config]]
- [[_COMMUNITY_Coding Discipline Simplicity|Coding Discipline: Simplicity]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Next.js & Vercel Logos|Next.js & Vercel Logos]]
- [[_COMMUNITY_Coding Discipline Goal-Driven|Coding Discipline: Goal-Driven]]
- [[_COMMUNITY_Coding Discipline Think First|Coding Discipline: Think First]]

## God Nodes (most connected - your core abstractions)
1. `createSupabaseAdminClient()` - 85 edges
2. `getSession()` - 56 edges
3. `useAppStore` - 41 edges
4. `cn()` - 28 edges
5. `Button` - 19 edges
6. `api()` - 16 edges
7. `compilerOptions` - 16 edges
8. `columns` - 15 edges
9. `columns` - 14 edges
10. `columns` - 14 edges

## Surprising Connections (you probably didn't know these)
- `asset_comments` --conceptually_related_to--> `script_generation credit cost`  [INFERRED]
  db/migrations/0006_asset_comments.sql → CLAUDE.md
- `script_generation credit cost` --references--> `CREDIT_COSTS`  [INFERRED]
  CLAUDE.md → lib/credits/costs.ts
- `POST()` --calls--> `createSupabaseAdminClient()`  [EXTRACTED]
  app/api/dev/provision-workspace/route.ts → lib/supabase/admin.ts
- `GET()` --calls--> `getSession()`  [INFERRED]
  app/api/diagnostics/health/route.ts → lib/auth/session.ts
- `GET()` --calls--> `createSupabaseAdminClient()`  [INFERRED]
  app/api/social/callback/facebook/route.ts → lib/supabase/admin.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Content Agent 6-Stage Pipeline Flow** — content_agent_setup_stage1_analyse, content_agent_setup_stage2_repurpose, content_agent_setup_stage3_schedule, content_agent_setup_stage4_thumbnails, content_agent_setup_stage5_publish, content_agent_setup_stage6_analytics [EXTRACTED 1.00]
- **LLM Coding Discipline Principles** — methods_think_before_coding, methods_simplicity_first, methods_surgical_changes, methods_goal_driven_execution [EXTRACTED 1.00]

## Communities (89 total, 16 thin omitted)

### Community 0 - "Content Pipeline & Ayrshare Publishing"
Cohesion: 0.07
Nodes (42): GET(), ayrsharePost(), AyrsharePostPayload, AyrsharePostResult, PipelineRunnerContext, runContentPipeline(), updateStageStatus(), analyzeTranscript() (+34 more)

### Community 1 - "Campaign Creation & Script Gen"
Cohesion: 0.08
Nodes (35): ASPECT_TO_IMAGE_SIZE, POST(), STYLE_SUFFIXES, anthropic, generateScript(), GenerateScriptParams, ScriptResult, script_generation credit cost (+27 more)

### Community 2 - "Migration Snapshot: Foreign Keys"
Cohesion: 0.04
Nodes (48): columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom, tableTo, columnsFrom (+40 more)

### Community 3 - "Runtime Dependencies"
Cohesion: 0.04
Nodes (47): dependencies, @anthropic-ai/sdk, class-variance-authority, clsx, drizzle-orm, @fal-ai/client, framer-motion, lucide-react (+39 more)

### Community 4 - "withWorkspace Routing Layer"
Cohesion: 0.06
Nodes (33): AdminClient, createScopedClient(), Handler, InsertRow, QueryBuilder, ScopedClient, scopedFrom(), withWorkspace() (+25 more)

### Community 5 - "creative_jobs Table Schema"
Cohesion: 0.05
Nodes (43): name, notNull, primaryKey, type, actual_cost_usd, completed_at, credits_charged, error_message (+35 more)

### Community 6 - "assets Table Schema"
Cohesion: 0.05
Nodes (42): duration_sec, file_size_bytes, height_px, job_id, metadata, storage_path, url, width_px (+34 more)

### Community 7 - "Auth Session & API Routes"
Cohesion: 0.18
Nodes (19): PATCH(), GET(), GET(), getSession(), GET(), PACKS, PLANS, GET() (+11 more)

### Community 8 - "Migration Snapshot: FKs"
Cohesion: 0.06
Nodes (33): columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom, tableTo, columnsFrom (+25 more)

### Community 9 - "campaigns Table Schema"
Cohesion: 0.06
Nodes (32): columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom, tableTo, campaigns_workspace_id_workspaces_id_fk (+24 more)

### Community 10 - "Provider Cost & Error Analysis"
Cohesion: 0.12
Nodes (19): PROVIDER_COST_USD, getUsageSummary(), JobTypeSummary, recordJobCost(), UsageSummary, analyzeJobFailure(), anthropic, FailureAnalysis (+11 more)

### Community 11 - "Campaign Lobby UI"
Cohesion: 0.09
Nodes (19): CampaignLobby(), CampaignRow, PLATFORM_COLORS, PLATFORM_LABELS, SocialProfile, STATUS_COLORS, STEP_LABELS, ADJECTIVES (+11 more)

### Community 12 - "Drizzle Schema & DB Client"
Cohesion: 0.10
Nodes (21): client, db, DrizzleClient, analyticsReports, assetComments, assets, campaigns, compositions (+13 more)

### Community 13 - "Brand Kit & Auth Pages"
Cohesion: 0.14
Nodes (10): BrandKit, BrandKitPage(), DEFAULTS, Font, FONTS, Button, ButtonProps, buttonVariants (+2 more)

### Community 14 - "Content Agent Pipeline (concepts)"
Cohesion: 0.09
Nodes (26): Weekly Analytics Cron Route, analytics_reports Table, ayrsharePost() (lib/ayrshare/client.ts), Claude lib (lib/claude/) Pattern, content_submissions Table, CRON_SECRET Env Var, enqueueJob() (lib/fal/queue.ts), getSession() (lib/auth/session.ts) (+18 more)

### Community 15 - "Dashboard UI Shell"
Cohesion: 0.13
Nodes (14): DashboardClient(), Props, ASPECT_RATIOS, FloatingPromptBar(), STYLES, api(), ApiOptions, getSupabaseClient() (+6 more)

### Community 16 - "Social Publishing Routes"
Cohesion: 0.17
Nodes (18): GET(), GET(), Asset, POST(), publishToFacebook(), publishToInstagram(), SocialProfile, exchangeCodeForToken() (+10 more)

### Community 17 - "Migration Snapshot: Constraints"
Cohesion: 0.09
Nodes (22): columns, name, nullsNotDistinct, columnsFrom, columnsTo, name, onDelete, onUpdate (+14 more)

### Community 18 - "Auth Provisioning & Login"
Cohesion: 0.17
Nodes (14): RootPage(), buildSlug(), getOrProvisionWorkspace(), ProvisionResult, ProvisionUser, WELCOME_CREDITS, signInWithPassword(), POST() (+6 more)

### Community 19 - "Shared Layout & UI"
Cohesion: 0.14
Nodes (13): LeftRail(), STEPS, CHECKLIST, RATIO_SHAPES, RightPanel(), TopBar(), cn(), NAV (+5 more)

### Community 20 - "Step Flow Components"
Cohesion: 0.14
Nodes (12): StepView(), GRID_COLS, Step1Create(), Step2Select(), ExpandType, Step3Expand(), PLATFORM_META, PlatformMeta (+4 more)

### Community 21 - "Dev Dependencies & Tooling"
Cohesion: 0.10
Nodes (20): devDependencies, dotenv-cli, drizzle-kit, eslint, eslint-config-next, @playwright/test, prettier, supertest (+12 more)

### Community 22 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 23 - "Campaign Brief Generation"
Cohesion: 0.16
Nodes (12): extractPageContent(), POST(), schema, CampaignBriefPanel(), DEFAULT_GOAL_META, GOAL_META, analyzeCampaignUrl(), anthropic (+4 more)

### Community 24 - "TopBar & Radix UI"
Cohesion: 0.17
Nodes (13): Props, STEPS, Avatar, AvatarFallback, AvatarImage, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem (+5 more)

### Community 25 - "Social Connect Checklist UI"
Cohesion: 0.18
Nodes (8): ChecklistItem, ChecklistState, PlatformCard(), PlatformGuide, platformInitials(), PLATFORMS, SocialProfile, WizardPlatformStep()

### Community 26 - "credit_accounts Table"
Cohesion: 0.17
Nodes (12): default, name, notNull, primaryKey, type, cached_balance, workspace_id, columns (+4 more)

### Community 27 - "API Health Checks"
Cohesion: 0.40
Nodes (9): GET(), checkAllApiKeys(), checkAnthropic(), checkAyrshare(), checkFal(), checkStripe(), checkSupabase(), ServiceHealth (+1 more)

### Community 28 - "Migration Column Defs"
Cohesion: 0.18
Nodes (11): name, notNull, primaryKey, type, name, notNull, primaryKey, type (+3 more)

### Community 29 - "campaigns Columns"
Cohesion: 0.18
Nodes (11): created_by, prompt, name, notNull, primaryKey, type, name, notNull (+3 more)

### Community 30 - "Stripe Checkout"
Cohesion: 0.33
Nodes (6): POST(), createCheckoutSession(), isSubscriptionPrice(), stripe, getOrCreateStripeCustomer(), purchaseCreditsSchema

### Community 31 - "Billing Page UI"
Cohesion: 0.22
Nodes (9): BillingData, BillingPage(), fmt(), Pack, Plan, Subscription, TIER_LABELS, Transaction (+1 more)

### Community 32 - "Migration Snapshot Metadata"
Cohesion: 0.20
Nodes (9): dialect, id, prevId, columns, name, schema, tables, public.credit_transactions (+1 more)

### Community 33 - "Ayrshare Profiles"
Cohesion: 0.33
Nodes (6): AyrshareProfileResponse, AyrshareSocialConnectResponse, AyrshareUserResponse, createAyrshareProfile(), generateSocialConnectUrl(), GET()

### Community 34 - "Migration Snapshot: FKs"
Cohesion: 0.22
Nodes (9): columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom, tableTo, creative_jobs_campaign_id_campaigns_id_fk (+1 more)

### Community 35 - "creative_jobs RLS & Constraints"
Cohesion: 0.22
Nodes (9): checkConstraints, compositePrimaryKeys, indexes, isRLSEnabled, name, policies, schema, uniqueConstraints (+1 more)

### Community 36 - "Content Submit & Publish"
Cohesion: 0.36
Nodes (5): POST(), publishToAyrshare(), POST(), approvePublishSchema, submitContentSchema

### Community 37 - "Image Composition Pipeline"
Cohesion: 0.36
Nodes (6): buildTextSvg(), composeImage(), ComposeImageOptions, FORMAT_DIMENSIONS, TextOverlay, POST()

### Community 38 - "Pipeline Status UI"
Cohesion: 0.32
Nodes (6): PipelineStatus(), PipelineStatusProps, STAGE_LABELS, STAGE_ORDER, StageResult, createSupabaseBrowserClient()

### Community 39 - "Migration FKs"
Cohesion: 0.25
Nodes (8): columnsFrom, columnsTo, name, onDelete, onUpdate, tableFrom, tableTo, creative_jobs_workspace_id_workspaces_id_fk

### Community 40 - "creative_jobs Indexes"
Cohesion: 0.25
Nodes (8): columns, concurrently, isUnique, method, name, with, idx_creative_jobs_status, indexes

### Community 41 - "Stripe Credit Grants"
Cohesion: 0.50
Nodes (6): POST(), creditGrantForPack(), creditsForSubscriptionTier(), grantCredits(), handleStripeEvent(), verifyStripeWebhook()

### Community 42 - "Index Defs"
Cohesion: 0.29
Nodes (7): columns, concurrently, isUnique, method, name, with, idx_creative_jobs_campaign

### Community 43 - "Index Defs"
Cohesion: 0.29
Nodes (7): columns, concurrently, isUnique, method, name, with, idx_creative_jobs_fal_id

### Community 44 - "Table RLS & Constraints"
Cohesion: 0.29
Nodes (7): checkConstraints, compositePrimaryKeys, isRLSEnabled, name, policies, schema, public.creative_jobs

### Community 45 - "Credit Meter & Job Status UI"
Cohesion: 0.38
Nodes (4): CreditMeter(), PACKS, JobStatusIndicator(), PopoverContent

### Community 46 - "Middleware & CORS Proxy"
Cohesion: 0.47
Nodes (4): config, getCorsHeaders(), proxy(), config

### Community 47 - "Brand Kit Route"
Cohesion: 0.33
Nodes (5): FONTS, GET(), hexColor, PATCH(), updateSchema

### Community 48 - "branding Column"
Cohesion: 0.33
Nodes (6): default, name, notNull, primaryKey, type, branding

### Community 49 - "created_at Column"
Cohesion: 0.33
Nodes (6): created_at, default, name, notNull, primaryKey, type

### Community 50 - "format Column"
Cohesion: 0.33
Nodes (6): format, default, name, notNull, primaryKey, type

### Community 51 - "id Column"
Cohesion: 0.33
Nodes (6): id, default, name, notNull, primaryKey, type

### Community 52 - "parameters Column"
Cohesion: 0.33
Nodes (6): parameters, default, name, notNull, primaryKey, type

### Community 53 - "status Column"
Cohesion: 0.33
Nodes (6): status, default, name, notNull, primaryKey, type

### Community 54 - "text_overlays Column"
Cohesion: 0.33
Nodes (6): text_overlays, default, name, notNull, primaryKey, type

### Community 55 - "updated_at Column"
Cohesion: 0.33
Nodes (6): updated_at, default, name, notNull, primaryKey, type

### Community 56 - "Claude Settings Config"
Cohesion: 0.40
Nodes (4): enableAllProjectMcpServers, enabledMcpjsonServers, permissions, allow

### Community 57 - "anchor_asset_id Column"
Cohesion: 0.40
Nodes (5): name, notNull, primaryKey, type, anchor_asset_id

### Community 58 - "hashtags Column"
Cohesion: 0.40
Nodes (5): hashtags, name, notNull, primaryKey, type

### Community 59 - "output_asset_id Column"
Cohesion: 0.40
Nodes (5): output_asset_id, name, notNull, primaryKey, type

### Community 60 - "fal_request_id Unique"
Cohesion: 0.40
Nodes (5): columns, name, nullsNotDistinct, uniqueConstraints, creative_jobs_fal_request_id_unique

### Community 63 - "Migration Journal"
Cohesion: 0.50
Nodes (3): dialect, entries, version

### Community 66 - "API Test Script"
Cohesion: 0.83
Nodes (3): test_fail(), test_pass(), test-api.sh script

### Community 70 - "Generic UI Icons"
Cohesion: 1.00
Nodes (3): File Document Icon, Globe Icon, Browser Window Icon

## Knowledge Gaps
- **574 isolated node(s):** `allow`, `enableAllProjectMcpServers`, `enabledMcpjsonServers`, `supabase`, `Props` (+569 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createSupabaseAdminClient()` connect `Auth Session & API Routes` to `Content Pipeline & Ayrshare Publishing`, `Campaign Creation & Script Gen`, `Ayrshare Profiles`, `withWorkspace Routing Layer`, `Content Submit & Publish`, `Image Composition Pipeline`, `Stripe Credit Grants`, `Provider Cost & Error Analysis`, `Drizzle Schema & DB Client`, `Brand Kit Route`, `Social Publishing Routes`, `Auth Provisioning & Login`, `Stripe Checkout`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `columns` connect `Migration Column Defs` to `credit_accounts Table`, `creative_jobs RLS & Constraints`, `branding Column`, `created_at Column`, `format Column`, `id Column`, `status Column`, `text_overlays Column`, `updated_at Column`, `anchor_asset_id Column`, `hashtags Column`, `output_asset_id Column`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `public.compositions` connect `creative_jobs RLS & Constraints` to `Migration Snapshot Metadata`, `Migration Snapshot: FKs`, `Migration Column Defs`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `createSupabaseAdminClient()` (e.g. with `ScopedClient` and `GET()`) actually correct?**
  _`createSupabaseAdminClient()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `getSession()` (e.g. with `GET()` and `GET()`) actually correct?**
  _`getSession()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `allow`, `enableAllProjectMcpServers`, `enabledMcpjsonServers` to the rest of the system?**
  _580 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Content Pipeline & Ayrshare Publishing` be split into smaller, more focused modules?**
  _Cohesion score 0.06568832983927324 - nodes in this community are weakly interconnected._