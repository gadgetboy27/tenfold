-- Let the assets bucket store SVG.
--
-- Logo Studio's whole deliverable is an SVG (logo_finalize renders Recraft's
-- text-to-vector output), but the bucket's allowed_mime_types listed only
-- jpeg/png/webp/mp4/mpeg/wav/octet-stream. Every SVG upload was rejected.
--
-- It surfaced as a 404 NoSuchKey on the branding screen rather than as an
-- upload error, because the fal webhook discarded the upload result and
-- inserted the asset row regardless — so the row pointed at an object that was
-- never written and everything except the render believed the logo existed.
-- That swallow is fixed in app/api/webhooks/fal/route.ts alongside this.
--
-- Note this is the SECOND time this bucket has done this: fal serves music as
-- application/octet-stream, which was rejected until that type was added, and
-- the symptom then was music URLs quietly staying on fal's CDN until they
-- expired. tests/unit/asset-mime-coverage.test.ts now pins the set.
--
-- Idempotent: safe to re-run, and a no-op where the type is already present.
update storage.buckets
set allowed_mime_types = allowed_mime_types || array['image/svg+xml']
where id = 'assets'
  and not ('image/svg+xml' = any(allowed_mime_types));
