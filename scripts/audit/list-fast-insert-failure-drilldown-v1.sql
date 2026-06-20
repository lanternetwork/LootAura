-- LIST_FAST_INSERT_FAILURE_DIAGNOSTIC_V1 — Section H drilldown + redacted sample (read-only)

WITH params AS (
  SELECT now() - interval '24 hours' AS cutoff
),
failed_hot AS (
  SELECT
    o.canonical_url,
    o.sale_instance_key,
    o.missing_ingestion_failure_reason,
    o.missing_ingestion_failure_details,
    o.list_metadata_snapshot
  FROM lootaura_v2.ystm_coverage_observations o
  CROSS JOIN params p
  WHERE o.ystm_valid_active = true
    AND o.lootaura_visible = false
    AND o.discovery_priority = 'hot'
    AND o.list_metadata_snapshot IS NOT NULL
    AND o.missing_ingestion_outcome = 'failed'
    AND o.missing_ingestion_failure_reason = 'insert_failed'
    AND o.missing_ingestion_attempted_at > p.cutoff
),
joined AS (
  SELECT
    f.canonical_url,
    f.sale_instance_key,
    f.missing_ingestion_failure_details->'list_fast_insert'->>'messageClass' AS message_class,
    f.missing_ingestion_failure_details->'list_fast_insert'->>'constraint' AS constraint_name,
    f.missing_ingestion_failure_details->'list_fast_insert'->>'code' AS pg_code,
    i_url.id AS url_match_id,
    i_url.source_url AS url_match_source_url,
    i_url.is_duplicate AS url_match_is_duplicate,
    i_url.status AS url_match_status,
    i_url.published_sale_id AS url_match_published_sale_id,
    i_key.id AS key_match_id,
    i_key.source_url AS key_match_source_url,
    i_key.is_duplicate AS key_match_is_duplicate,
    i_key.status AS key_match_status,
    i_key.published_sale_id AS key_match_published_sale_id
  FROM failed_hot f
  LEFT JOIN lootaura_v2.ingested_sales i_url
    ON i_url.source_url = f.canonical_url
  LEFT JOIN lootaura_v2.ingested_sales i_key
    ON i_key.source_platform = 'external_page_source'
    AND i_key.sale_instance_key = f.sale_instance_key
    AND i_key.superseded_by_ingested_sale_id IS NULL
)
SELECT 'H_meta' AS section, 'total_insert_failed' AS bucket, COUNT(*)::bigint AS n, NULL::numeric AS pct, NULL::bigint AS denominator
FROM failed_hot
UNION ALL
SELECT 'H_meta', 'rows_with_insert_detail',
  COUNT(*) FILTER (
    WHERE missing_ingestion_failure_details->'list_fast_insert'->>'messageClass' IS NOT NULL
  )::bigint,
  NULL, NULL
FROM failed_hot
UNION ALL
SELECT 'H_messageClass', COALESCE(message_class, '(null)'), COUNT(*)::bigint,
  ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM joined
GROUP BY 1, 2
UNION ALL
SELECT 'H_constraint', COALESCE(constraint_name, '(null)'), COUNT(*)::bigint,
  ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM joined
GROUP BY 1, 2
UNION ALL
SELECT 'H_collision', 'same_source_url_match_count',
  COUNT(*) FILTER (WHERE url_match_id IS NOT NULL)::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE url_match_id IS NOT NULL) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM joined
UNION ALL
SELECT 'H_collision', 'same_instance_key_match_count',
  COUNT(*) FILTER (WHERE key_match_id IS NOT NULL)::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE key_match_id IS NOT NULL) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM joined
UNION ALL
SELECT 'H_collision', 'same_instance_key_different_url_count',
  COUNT(*) FILTER (
    WHERE key_match_id IS NOT NULL AND key_match_source_url IS DISTINCT FROM canonical_url
  )::bigint,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE key_match_id IS NOT NULL AND key_match_source_url IS DISTINCT FROM canonical_url
  ) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM joined
UNION ALL
SELECT 'H_collision', 'published_match_count',
  COUNT(*) FILTER (
    WHERE url_match_published_sale_id IS NOT NULL OR key_match_published_sale_id IS NOT NULL
  )::bigint,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE url_match_published_sale_id IS NOT NULL OR key_match_published_sale_id IS NOT NULL
  ) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM joined
UNION ALL
SELECT 'H_collision', 'duplicate_match_count',
  COUNT(*) FILTER (
    WHERE url_match_is_duplicate IS TRUE OR key_match_is_duplicate IS TRUE
  )::bigint,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE url_match_is_duplicate IS TRUE OR key_match_is_duplicate IS TRUE
  ) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM joined
UNION ALL
SELECT 'H_collision', 'expired_match_count',
  COUNT(*) FILTER (
    WHERE url_match_status = 'expired' OR key_match_status = 'expired'
  )::bigint,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE url_match_status = 'expired' OR key_match_status = 'expired'
  ) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM joined
UNION ALL
SELECT 'H_collision', 'no_collision_match_count',
  COUNT(*) FILTER (WHERE url_match_id IS NULL AND key_match_id IS NULL)::bigint,
  ROUND(100.0 * COUNT(*) FILTER (WHERE url_match_id IS NULL AND key_match_id IS NULL) / NULLIF((SELECT COUNT(*) FROM failed_hot), 0), 1),
  (SELECT COUNT(*) FROM failed_hot)
FROM joined
UNION ALL
SELECT 'H_sample', 'listing_' || substring(md5(j.canonical_url) from 1 for 8),
  1::bigint,
  NULL,
  NULL
FROM (
  SELECT DISTINCT ON (canonical_url)
    canonical_url,
    message_class,
    constraint_name,
    pg_code,
    key_match_source_url IS DISTINCT FROM canonical_url AS instance_key_different_url
  FROM joined
  ORDER BY canonical_url
  LIMIT 10
) j
ORDER BY section, bucket;
