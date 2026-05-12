-- Verification: imported sales should not retain known branding image URLs.
-- Run after migration 169 (read-only).

-- 1) Count imported rows whose cover or any images[] still matches branding heuristics (expect 0).
SELECT count(*)::int AS remaining_branding_candidates
FROM lootaura_v2.sales s
WHERE (
    s.ingested_sale_id IS NOT NULL
    OR (s.import_source IS NOT NULL AND btrim(s.import_source) <> '')
  )
  AND (
    lootaura_v2.url_matches_ingest_branding_asset(s.cover_image_url)
    OR EXISTS (
      SELECT 1
      FROM unnest(coalesce(s.images, '{}'::text[])) u(x)
      WHERE lootaura_v2.url_matches_ingest_branding_asset(x)
    )
  );

-- 2) Sample any remaining hits (expect no rows).
SELECT s.id, s.cover_image_url, s.images
FROM lootaura_v2.sales s
WHERE (
    s.ingested_sale_id IS NOT NULL
    OR (s.import_source IS NOT NULL AND btrim(s.import_source) <> '')
  )
  AND (
    lootaura_v2.url_matches_ingest_branding_asset(s.cover_image_url)
    OR EXISTS (
      SELECT 1
      FROM unnest(coalesce(s.images, '{}'::text[])) u(x)
      WHERE lootaura_v2.url_matches_ingest_branding_asset(x)
    )
  )
LIMIT 20;

-- 3) Optional: YSTM /pics/ logo path on official host (expect 0 for imported scope).
SELECT count(*)::int AS ystm_pics_logo_rows
FROM lootaura_v2.sales s
WHERE (
    s.ingested_sale_id IS NOT NULL
    OR (s.import_source IS NOT NULL AND btrim(s.import_source) <> '')
  )
  AND (
    lower(coalesce(s.cover_image_url, '')) ~ 'yardsaletreasuremap\.[^/]+/pics/.*ystm_site_logo'
    OR EXISTS (
      SELECT 1
      FROM unnest(coalesce(s.images, '{}'::text[])) u(x)
      WHERE lower(x) ~ 'yardsaletreasuremap\.[^/]+/pics/.*ystm_site_logo'
    )
  );
