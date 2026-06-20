-- LIST_FAST_FAILURE_DISTRIBUTION_V1 — read-only production audit (Sections A–G)
-- Run against lootaura_v2 read replica / admin. No writes.

WITH params AS (
  SELECT now() - interval '24 hours' AS cutoff
),
failed_hot AS (
  SELECT
    o.canonical_url,
    o.missing_ingestion_failure_reason,
    o.missing_ingestion_attempted_at,
    o.list_metadata_snapshot,
    o.sale_instance_key,
    o.lootaura_visible
  FROM lootaura_v2.ystm_coverage_observations o
  CROSS JOIN params p
  WHERE o.ystm_valid_active = true
    AND o.lootaura_visible = false
    AND o.discovery_priority = 'hot'
    AND o.list_metadata_snapshot IS NOT NULL
    AND o.missing_ingestion_outcome = 'failed'
    AND o.missing_ingestion_attempted_at > p.cutoff
),
ingested_hot AS (
  SELECT
    o.canonical_url,
    o.missing_ingestion_attempted_at
  FROM lootaura_v2.ystm_coverage_observations o
  CROSS JOIN params p
  WHERE o.ystm_valid_active = true
    AND o.lootaura_visible = false
    AND o.discovery_priority = 'hot'
    AND o.list_metadata_snapshot IS NOT NULL
    AND o.missing_ingestion_outcome = 'ingested'
    AND o.missing_ingestion_attempted_at > p.cutoff
),
failed_join AS (
  SELECT
    f.*,
    i.id AS ingested_id,
    i.status AS ingested_status,
    i.published_sale_id,
    i.sale_instance_key AS ingested_sale_instance_key,
    s.ends_at,
    s.moderation_status,
    s.archived_at AS sale_archived_at,
    s.status AS sale_status
  FROM failed_hot f
  LEFT JOIN lootaura_v2.ingested_sales i
    ON i.source_url = f.canonical_url AND i.is_duplicate = false
  LEFT JOIN lootaura_v2.sales s
    ON s.id = i.published_sale_id
)
SELECT 'A_meta' AS section, 'total_failed_hot_24h' AS bucket, COUNT(*)::bigint AS n, NULL::numeric AS pct, NULL::bigint AS denominator
FROM failed_hot
UNION ALL
SELECT 'A_meta', 'total_ingested_hot_24h', COUNT(*)::bigint, NULL, NULL FROM ingested_hot
UNION ALL
SELECT 'A_meta', 'hot_queue_depth', COUNT(*)::bigint, NULL, NULL
FROM lootaura_v2.ystm_coverage_observations
WHERE ystm_valid_active = true AND lootaura_visible = false AND discovery_priority = 'hot'
UNION ALL
SELECT 'A_meta', 'oldest_failed_age_hours',
  ROUND(EXTRACT(EPOCH FROM (now() - MIN(missing_ingestion_attempted_at))) / 3600, 2)::bigint,
  NULL, NULL
FROM failed_hot
UNION ALL
SELECT 'A_meta', 'newest_failed_age_hours',
  ROUND(EXTRACT(EPOCH FROM (now() - MAX(missing_ingestion_attempted_at))) / 3600, 2)::bigint,
  NULL, NULL
FROM failed_hot
UNION ALL
SELECT 'B_reason', COALESCE(missing_ingestion_failure_reason, '(null)'), COUNT(*)::bigint,
  ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM failed_hot
GROUP BY 1, 2
UNION ALL
SELECT 'C_snapshot',
  CASE
    WHEN list_metadata_snapshot IS NULL THEN 'missing_snapshot'
    WHEN (list_metadata_snapshot->>'lat') IS NOT NULL AND (list_metadata_snapshot->>'lng') IS NOT NULL THEN 'native_coords_present'
    WHEN (list_metadata_snapshot->>'address') IS NOT NULL THEN 'address_only'
    ELSE 'no_address_no_coords'
  END,
  COUNT(*)::bigint,
  ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM failed_hot
GROUP BY 1, 2
UNION ALL
SELECT 'D_suppression', 'existing_published_sale_linked',
  COUNT(*) FILTER (WHERE published_sale_id IS NOT NULL)::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE published_sale_id IS NOT NULL) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM failed_join
UNION ALL
SELECT 'D_suppression', 'archived_at_not_null',
  COUNT(*) FILTER (
    WHERE ingested_status IN ('archived', 'expired')
      OR sale_archived_at IS NOT NULL
      OR sale_status = 'archived'
  )::bigint,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE ingested_status IN ('archived', 'expired')
      OR sale_archived_at IS NOT NULL
      OR sale_status = 'archived'
  ) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM failed_join
UNION ALL
SELECT 'D_suppression', 'ends_at_past',
  COUNT(*) FILTER (WHERE ends_at IS NOT NULL AND ends_at <= now())::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ends_at IS NOT NULL AND ends_at <= now()) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM failed_join
UNION ALL
SELECT 'D_suppression', 'moderation_hidden',
  COUNT(*) FILTER (WHERE moderation_status = 'hidden_by_admin')::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE moderation_status = 'hidden_by_admin') / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM failed_join
UNION ALL
SELECT 'D_suppression', 'published_but_observation_stale',
  COUNT(*) FILTER (WHERE published_sale_id IS NOT NULL AND lootaura_visible = false)::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE published_sale_id IS NOT NULL AND lootaura_visible = false) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM failed_join
UNION ALL
SELECT 'E_geocode', 'geocode_unavailable_failure',
  COUNT(*) FILTER (WHERE missing_ingestion_failure_reason = 'geocode_unavailable')::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE missing_ingestion_failure_reason = 'geocode_unavailable') / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM failed_hot
UNION ALL
SELECT 'E_geocode', 'native_coords_in_snapshot',
  COUNT(*) FILTER (
    WHERE (list_metadata_snapshot->>'lat') IS NOT NULL
      AND (list_metadata_snapshot->>'lng') IS NOT NULL
  )::bigint,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE (list_metadata_snapshot->>'lat') IS NOT NULL
      AND (list_metadata_snapshot->>'lng') IS NOT NULL
  ) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM failed_hot
ORDER BY section, bucket;
