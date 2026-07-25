-- 0025_publish_analytics.sql — Phase 7: Analytics & Learning (PRODUCT_STRATEGY.md §4).
--
-- Each publish loops per-platform (app/api/publish/route.ts), calling Ayrshare
-- once per platform — so each platform gets its OWN top-level Ayrshare post id,
-- not one shared id. The existing `ayrshare_post_id` (singular) column can't
-- hold that; ayrshare_post_ids is a platform -> id map instead. That column is
-- left as-is (already unused/unset) rather than repurposed — not this change's
-- mess to clean up.
ALTER TABLE publish_records
  ADD COLUMN IF NOT EXISTS ayrshare_post_ids jsonb NOT NULL DEFAULT '{}';

-- "Which styles/models perform best?" — publish_records.analytics stores a
-- normalized engagementScore per record (computed in app code at fetch time,
-- since each platform's raw metrics use different field names — see
-- lib/analytics/engagement.ts). This aggregates that score by the campaign's
-- generation style/model. Workspace-scoped (unlike variety_model_popularity,
-- which is a deliberately global/anonymous signal) — post performance is
-- private business data, so the caller must pass their own workspace id.
CREATE OR REPLACE FUNCTION style_performance(p_workspace_id uuid)
RETURNS TABLE(style text, model text, posts bigint, avg_engagement numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.parameters->>'style' AS style,
    c.parameters->>'model' AS model,
    count(*) AS posts,
    avg((pr.analytics->>'engagementScore')::numeric) AS avg_engagement
  FROM publish_records pr
  JOIN compositions co ON co.id = pr.composition_id
  JOIN campaigns c ON c.id = co.campaign_id
  WHERE pr.workspace_id = p_workspace_id
    AND pr.analytics ? 'engagementScore'
  GROUP BY c.parameters->>'style', c.parameters->>'model'
  ORDER BY avg_engagement DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION style_performance(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION style_performance(uuid) TO service_role;
