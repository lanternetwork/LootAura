-- Read-only RPC for admin ingestion integrity monitoring (no data mutations).
-- Called from GET /api/admin/ingestion/integrity via service role.
-- Keep index allowlist in sync with lib/admin/ingestionIntegrity.ts (CRITICAL_INDEX_NAMES).

CREATE OR REPLACE FUNCTION lootaura_v2.ingestion_integrity_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = lootaura_v2, pg_catalog
AS $fn$
  SELECT jsonb_build_object(
    'generated_at', to_jsonb(now() AT TIME ZONE 'utc'),
    'duplicate_ingested_sale_id_group_count',
      (
        SELECT count(*)::bigint
        FROM (
          SELECT ingested_sale_id
          FROM lootaura_v2.sales
          WHERE ingested_sale_id IS NOT NULL
          GROUP BY ingested_sale_id
          HAVING count(*) > 1
        ) dup_ingested
      ),
    'duplicate_ingested_sale_id_samples',
      coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object('ingested_sale_id', ingested_sale_id, 'sale_count', cnt)
            ORDER BY ingested_sale_id
          )
          FROM (
            SELECT ingested_sale_id, count(*)::bigint AS cnt
            FROM lootaura_v2.sales
            WHERE ingested_sale_id IS NOT NULL
            GROUP BY ingested_sale_id
            HAVING count(*) > 1
            ORDER BY ingested_sale_id ASC
            LIMIT 8
          ) s1
        ),
        '[]'::jsonb
      ),
    'orphan_published_sale_id_count',
      (
        SELECT count(*)::bigint
        FROM lootaura_v2.ingested_sales i
        WHERE i.published_sale_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM lootaura_v2.sales s WHERE s.id = i.published_sale_id
          )
      ),
    'orphan_sales_ingested_id_count',
      (
        SELECT count(*)::bigint
        FROM lootaura_v2.sales s
        WHERE s.ingested_sale_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM lootaura_v2.ingested_sales x WHERE x.id = s.ingested_sale_id
          )
      ),
    'index_presence',
      (
        SELECT coalesce(
          jsonb_agg(
            jsonb_build_object('name', name, 'present', present) ORDER BY ord
          ),
          '[]'::jsonb
        )
        FROM (
          SELECT
            ord,
            name,
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_indexes pi
              WHERE pi.schemaname = 'lootaura_v2'
                AND pi.indexname = name
            ) AS present
          FROM unnest(
            ARRAY[
              'idx_sales_ingested_sale_id_unique',
              'sales_geom_gist_idx',
              'idx_ingested_sales_publish_worker_claim',
              'idx_ingested_sales_geocode_claim'
            ]
          ) WITH ORDINALITY AS t(name, ord)
        ) idx
      ),
    'duplicate_external_source_url_group_count',
      (
        SELECT count(*)::bigint
        FROM (
          SELECT external_source_url
          FROM lootaura_v2.sales
          WHERE status = 'published'
            AND external_source_url IS NOT NULL
            AND (import_source IS NOT NULL OR ingested_sale_id IS NOT NULL)
          GROUP BY external_source_url
          HAVING count(*) > 1
        ) dup_url
      ),
    'duplicate_external_source_url_samples',
      coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'external_source_url', left(external_source_url, 160),
              'sale_count', cnt
            )
            ORDER BY cnt DESC, external_source_url
          )
          FROM (
            SELECT external_source_url, count(*)::bigint AS cnt
            FROM lootaura_v2.sales
            WHERE status = 'published'
              AND external_source_url IS NOT NULL
              AND (import_source IS NOT NULL OR ingested_sale_id IS NOT NULL)
            GROUP BY external_source_url
            HAVING count(*) > 1
            ORDER BY cnt DESC, external_source_url
            LIMIT 8
          ) s2
        ),
        '[]'::jsonb
      )
  );
$fn$;

REVOKE EXECUTE ON FUNCTION lootaura_v2.ingestion_integrity_report() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.ingestion_integrity_report() FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.ingestion_integrity_report() FROM authenticated;
GRANT EXECUTE ON FUNCTION lootaura_v2.ingestion_integrity_report() TO service_role;

COMMENT ON FUNCTION lootaura_v2.ingestion_integrity_report() IS
  'Read-only snapshot for admin ingestion integrity (duplicates, orphans, critical indexes). No PII beyond admin-visible UUIDs and truncated URLs.';
