-- PUBLISHED_NOT_VISIBLE_DISTRIBUTION_V2 — read-only production audit
-- Run against lootaura_v2 read replica / admin. No writes.

WITH cohort AS (
  SELECT
    o.canonical_url,
    o.matched_sale_id,
    o.matched_ingested_sale_id,
    o.sale_instance_key,
    o.appearance_source,
    o.false_exclusion_secondary_tags,
    o.match_method
  FROM lootaura_v2.ystm_coverage_observations o
  WHERE o.ystm_valid_active = true
    AND o.lootaura_visible = false
    AND o.false_exclusion_primary_bucket = 'published_not_visible'
),
joined AS (
  SELECT
    c.*,
    i.id AS ingested_sale_id,
    i.status AS ingested_status,
    i.published_sale_id AS ingested_published_sale_id,
    i.sale_instance_key AS ingested_sale_instance_key,
    COALESCE(i.published_sale_id, c.matched_sale_id) AS linked_sale_id,
    s.id AS sale_id,
    s.status AS sale_status,
    s.archived_at,
    s.ends_at,
    s.moderation_status
  FROM cohort c
  LEFT JOIN lootaura_v2.ingested_sales i
    ON i.source_url = c.canonical_url AND i.is_duplicate = false
  LEFT JOIN lootaura_v2.sales s
    ON s.id = COALESCE(i.published_sale_id, c.matched_sale_id)
)
SELECT 'A_meta' AS section, 'cohort_total' AS bucket, COUNT(*)::bigint AS n, NULL::numeric AS pct
FROM cohort
UNION ALL
SELECT 'C_visibility', 'archived',
  COUNT(*) FILTER (
    WHERE sale_status = 'archived' OR archived_at IS NOT NULL
  )::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE sale_status = 'archived' OR archived_at IS NOT NULL) / NULLIF((SELECT COUNT(*) FROM cohort), 0), 1)
FROM joined
UNION ALL
SELECT 'C_visibility', 'moderation_hidden',
  COUNT(*) FILTER (WHERE moderation_status = 'hidden_by_admin')::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE moderation_status = 'hidden_by_admin') / NULLIF((SELECT COUNT(*) FROM cohort), 0), 1)
FROM joined
UNION ALL
SELECT 'C_visibility', 'expired',
  COUNT(*) FILTER (
    WHERE ends_at IS NOT NULL
      AND ends_at <= now()
      AND (sale_status IS DISTINCT FROM 'archived')
      AND archived_at IS NULL
  )::bigint,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE ends_at IS NOT NULL
      AND ends_at <= now()
      AND (sale_status IS DISTINCT FROM 'archived')
      AND archived_at IS NULL
  ) / NULLIF((SELECT COUNT(*) FROM cohort), 0), 1)
FROM joined
UNION ALL
SELECT 'C_visibility', 'phase4_visible',
  COUNT(*) FILTER (
    WHERE sale_status = 'published'
      AND archived_at IS NULL
      AND (ends_at IS NULL OR ends_at > now())
      AND (moderation_status IS DISTINCT FROM 'hidden_by_admin')
  )::bigint,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE sale_status = 'published'
      AND archived_at IS NULL
      AND (ends_at IS NULL OR ends_at > now())
      AND (moderation_status IS DISTINCT FROM 'hidden_by_admin')
  ) / NULLIF((SELECT COUNT(*) FROM cohort), 0), 1)
FROM joined
UNION ALL
SELECT 'C_visibility', 'no_linked_sale',
  COUNT(*) FILTER (WHERE linked_sale_id IS NULL AND ingested_sale_id IS NULL)::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE linked_sale_id IS NULL AND ingested_sale_id IS NULL) / NULLIF((SELECT COUNT(*) FROM cohort), 0), 1)
FROM joined
UNION ALL
SELECT 'E_signal', 'publish_hook',
  COUNT(*) FILTER (WHERE appearance_source = 'publish_hook')::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE appearance_source = 'publish_hook') / NULLIF((SELECT COUNT(*) FROM cohort), 0), 1)
FROM joined
UNION ALL
SELECT 'E_signal', 'observation_stale_tag',
  COUNT(*) FILTER (WHERE false_exclusion_secondary_tags @> ARRAY['observation_stale']::text[])::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE false_exclusion_secondary_tags @> ARRAY['observation_stale']::text[]) / NULLIF((SELECT COUNT(*) FROM cohort), 0), 1)
FROM joined
ORDER BY section, bucket;
