-- YSTM_NATIONAL_2HOUR_INGESTION_V1: deploy-day backfill — aged missing queue → cold priority.

UPDATE lootaura_v2.ystm_coverage_observations
SET discovery_priority = 'cold',
    updated_at = now()
WHERE ystm_valid_active = true
  AND lootaura_visible = false
  AND discovery_priority IS NULL
  AND first_list_seen_at IS NOT NULL
  AND first_list_seen_at < now() - interval '24 hours';
