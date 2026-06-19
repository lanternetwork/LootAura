-- YSTM_NATIONAL_2HOUR_INGESTION_V1: SLA rollup view for admin diagnostics.

CREATE OR REPLACE VIEW lootaura_v2.ystm_2hour_slo_rollup_v1 AS
SELECT
  date_trunc('day', COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at)) AS day,
  count(*) FILTER (
    WHERE o.first_published_at IS NOT NULL
      AND o.first_list_seen_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (o.first_published_at - COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at))) / 3600.0 <= 2
  )::int AS within_sla,
  count(*) FILTER (
    WHERE o.first_published_at IS NOT NULL
      AND o.first_list_seen_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (o.first_published_at - COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at))) / 3600.0 > 2
  )::int AS breached_sla,
  count(*) FILTER (WHERE o.first_published_at IS NOT NULL AND o.first_list_seen_at IS NOT NULL)::int AS cohort_total,
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (o.first_published_at - COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at))) / 3600.0
  ) FILTER (WHERE o.first_published_at IS NOT NULL AND o.first_list_seen_at IS NOT NULL) AS p50_publish_hours,
  percentile_cont(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (o.first_published_at - COALESCE(o.ystm_listing_posted_at, o.first_list_seen_at))) / 3600.0
  ) FILTER (WHERE o.first_published_at IS NOT NULL AND o.first_list_seen_at IS NOT NULL) AS p95_publish_hours
FROM lootaura_v2.ystm_coverage_observations o
WHERE o.ystm_valid_active = true
GROUP BY 1;

COMMENT ON VIEW lootaura_v2.ystm_2hour_slo_rollup_v1 IS
  'Daily YSTM 2-hour publish SLA rollup (first list appearance → first_published_at).';

GRANT SELECT ON lootaura_v2.ystm_2hour_slo_rollup_v1 TO service_role;
