BEGIN;

-- Revoke broad execute paths first (direct + inherited via PUBLIC).
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM authenticated;

-- Keep service-role execution.
GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) TO service_role;

COMMIT;

