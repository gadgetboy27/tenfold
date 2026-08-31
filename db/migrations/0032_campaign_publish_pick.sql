-- One video per publish — name the cut, don't guess it.
--
-- Publishing resolved its video by "newest first" (app/api/publish/route.ts's
-- assetsByAspect fan-out, and Studio's own sort on rehydrate). That is a
-- guess, and it goes wrong the moment a campaign holds more than one export:
-- campaign 62cc89cd ("Stellar Launch") accumulated 9 composed_video rows and
-- 14 audio rows across a fortnight of re-renders, and nothing in the UI could
-- remove one or say which was the keeper. The most recent render is not
-- reliably the good one — a user who exports a variant to compare it has just
-- silently changed what publishes.
--
-- publish_asset_id makes the choice explicit and durable. Publish uses this
-- asset for EVERY platform (see the route's note on why the per-aspect fan-out
-- is skipped once a pick exists), and refuses to guess when a campaign holds
-- several videos and none is picked.
--
-- ON DELETE SET NULL, not CASCADE: deleting the picked video must un-pick the
-- campaign, never delete the campaign.
alter table campaigns
  add column if not exists publish_asset_id uuid
    references assets(id) on delete set null;

comment on column campaigns.publish_asset_id is
  'The one video asset this campaign publishes. NULL = nothing picked yet; publish auto-uses the only video, or refuses if there are several.';
