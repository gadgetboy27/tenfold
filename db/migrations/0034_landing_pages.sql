-- 0034_landing_pages.sql — the page the ad points at.
--
-- Scoped to a campaign, not free-standing: the whole argument for building
-- this (docs/landing-pages-scope.md) is that the page uses the creative that
-- campaign just made, in that brand, saying what those ads say. A page with no
-- campaign is a website builder, which is a different product with far better
-- incumbents. campaign_id NOT NULL enforces that at the schema level so the
-- constraint can't quietly erode later.
--
-- `blocks` and `theme` are jsonb validated by lib/landing/blocks.ts on the way
-- in and on the way out, exactly as compositions handles layers. `theme` is a
-- SNAPSHOT of the brand kit taken at generation time — editing the brand kit
-- must never restyle a live page someone is running paid traffic to.
CREATE TABLE IF NOT EXISTS landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_by uuid,
  -- Lowercase by construction (lib/landing/blocks.ts buildPageSlug); the check
  -- keeps a hand-written INSERT from creating a slug the router can't match.
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  style text NOT NULL CHECK (style IN ('lead', 'story', 'offer')),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- NULL = draft. A draft 404s publicly rather than 403ing: an unpublished
  -- page should be indistinguishable from one that never existed.
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_campaign
  ON landing_pages (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_pages_workspace
  ON landing_pages (workspace_id);
-- The public renderer's only query: slug → published page.
CREATE INDEX IF NOT EXISTS idx_landing_pages_published
  ON landing_pages (slug) WHERE published_at IS NOT NULL;

-- Leads. `fields` is jsonb because the form block declares its own fields —
-- a fixed name/email/phone table would silently drop anything the page asked
-- for beyond it, and the one thing worse than no form is a form that loses
-- answers.
CREATE TABLE IF NOT EXISTS page_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- utm/referrer, so "which ad actually worked" has an answer. The reason the
  -- campaign link exists at all is to be able to ask that.
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_leads_page
  ON page_leads (page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_leads_workspace
  ON page_leads (workspace_id, created_at DESC);

-- RLS as the second layer, per root CLAUDE.md §2.4. Both public reads and lead
-- writes go through server routes on the service-role client, so no anon
-- policy is granted here: the public renderer is trusted server code that
-- filters on published_at, not an anon SELECT.
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_pages_workspace_member ON landing_pages;
CREATE POLICY landing_pages_workspace_member ON landing_pages
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS page_leads_workspace_member ON page_leads;
CREATE POLICY page_leads_workspace_member ON page_leads
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
