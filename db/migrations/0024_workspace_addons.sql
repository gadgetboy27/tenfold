-- Purchasable per-workspace add-ons (e.g. the Business-tier Blend Package
-- upsell). Separate table from `subscriptions` because a workspace can hold
-- its main tier subscription AND one or more add-on subscriptions
-- simultaneously — each is its own distinct Stripe subscription object.
CREATE TABLE "workspace_addons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "addon_key" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "stripe_subscription_id" text,
  "stripe_customer_id" text,
  "current_period_end" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_addons_stripe_subscription_id_unique" UNIQUE ("stripe_subscription_id"),
  CONSTRAINT "workspace_addons_workspace_key_unique" UNIQUE ("workspace_id", "addon_key"),
  CONSTRAINT "workspace_addon_status_check" CHECK ("status" IN ('active','past_due','canceled'))
);

ALTER TABLE "workspace_addons"
  ADD CONSTRAINT "workspace_addons_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;

CREATE INDEX "idx_workspace_addons_workspace" ON "workspace_addons" USING btree ("workspace_id");

ALTER TABLE "workspace_addons" ENABLE ROW LEVEL SECURITY;
