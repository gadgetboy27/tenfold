-- 0023_variety_model_popularity.sql — "which variety-pack models do users pick?"
-- The variety pack (feat: campaigns/route.ts) tags each anchor candidate with the
-- model that made it (assets.metadata.model). When a user promotes one to the
-- campaign anchor (campaigns.anchor_asset_id), that's a vote for its model. This
-- function tallies those votes GLOBALLY (a crowd signal, not workspace-scoped —
-- "so the next user knows which are popular") so /api/models can surface it.
--
-- Aggregation lives in SQL (not JS) so it never pulls asset rows into the app.
-- STABLE + read-only; SECURITY DEFINER so the service-role admin client can call
-- it without RLS on campaigns/assets getting in the way of the cross-tenant count.

CREATE OR REPLACE FUNCTION variety_model_popularity()
RETURNS TABLE(model text, picks bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.metadata->>'model' AS model, count(*) AS picks
  FROM campaigns c
  JOIN assets a ON a.id = c.anchor_asset_id
  WHERE a.metadata ? 'model'
    AND a.metadata->>'model' IS NOT NULL
  GROUP BY a.metadata->>'model'
  ORDER BY picks DESC;
$$;

-- Service role only — only the admin client (in /api/models) reads this.
REVOKE ALL ON FUNCTION variety_model_popularity() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION variety_model_popularity() TO service_role;
