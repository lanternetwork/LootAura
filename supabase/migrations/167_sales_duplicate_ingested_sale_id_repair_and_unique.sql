-- =============================================================================
-- Migration 167: FK-safe repair for duplicate lootaura_v2.sales rows sharing
-- the same non-null ingested_sale_id, then enforce partial unique index.
--
-- Root cause (production): idx_sales_ingested_sale_id is NON-UNIQUE; unique
-- index idx_sales_ingested_sale_id_unique was never applied. Repeated publish
-- INSERTs therefore succeeded without 23505 conflict; publish worker reuse
-- path never ran.
--
-- Strategy (fail-closed, no blind DELETE of duplicate sales rows):
-- 1) Rank rows per ingested_sale_id; keep one canonical row (deterministic).
-- 2) Point ingested_sales.published_sale_id at the canonical sales.id.
-- 3) Archive non-canonical duplicates: status=archived, archived_at=now(),
--    ingested_sale_id=NULL (preserves FK children; removes uniqueness conflict).
-- 4) CREATE UNIQUE INDEX IF NOT EXISTS on (ingested_sale_id) WHERE NOT NULL.
--
-- Helper strategy: no TEMP tables and no persistent helper relations. All
-- ranking and updates run inside one SQL statement as data-modifying CTEs
-- (dup_keys → ranked → upd_ingested → upd_sales_losers), so nothing remains
-- after the statement and Supabase RLS-on-helper warnings do not apply.
--
-- Diagnostics: RAISE NOTICE counts (no PII). idx_sales_ingested_sale_id left
-- untouched (non-unique helper index from ingestion schema).
-- =============================================================================

DO $$
DECLARE
  duplicate_groups_before integer;
BEGIN
  SELECT count(*)::integer
  INTO duplicate_groups_before
  FROM (
    SELECT ingested_sale_id
    FROM lootaura_v2.sales
    WHERE ingested_sale_id IS NOT NULL
    GROUP BY ingested_sale_id
    HAVING count(*) > 1
  ) d;

  RAISE NOTICE 'migration_167_sales_ingested_dup_repair: duplicate_nonnull_groups_before=%',
    duplicate_groups_before;
END
$$;

DO $$
DECLARE
  n_repair bigint;
  n_arch bigint;
BEGIN
  WITH dup_keys AS (
    SELECT ingested_sale_id
    FROM lootaura_v2.sales
    WHERE ingested_sale_id IS NOT NULL
    GROUP BY ingested_sale_id
    HAVING count(*) > 1
  ),
  ranked AS (
    SELECT
      s.id,
      s.ingested_sale_id,
      row_number() OVER (
        PARTITION BY s.ingested_sale_id
        ORDER BY
          (CASE WHEN s.status = 'published' THEN 0 ELSE 1 END) ASC,
          (CASE WHEN s.archived_at IS NULL THEN 0 ELSE 1 END) ASC,
          s.updated_at DESC NULLS LAST,
          s.created_at DESC NULLS LAST,
          s.id DESC
      ) AS rn
    FROM lootaura_v2.sales s
    INNER JOIN dup_keys d ON d.ingested_sale_id = s.ingested_sale_id
    WHERE s.ingested_sale_id IS NOT NULL
  ),
  upd_ingested AS (
    UPDATE lootaura_v2.ingested_sales ins
    SET published_sale_id = c.canonical_sale_id
    FROM (
      SELECT ingested_sale_id, id AS canonical_sale_id
      FROM ranked
      WHERE rn = 1
    ) c
    WHERE ins.id = c.ingested_sale_id
      AND (ins.published_sale_id IS DISTINCT FROM c.canonical_sale_id)
    RETURNING 1
  ),
  upd_sales_losers AS (
    UPDATE lootaura_v2.sales s
    SET
      status = 'archived',
      archived_at = coalesce(s.archived_at, now()),
      ingested_sale_id = NULL
    FROM ranked r
    WHERE s.id = r.id
      AND r.rn > 1
      AND (SELECT coalesce(count(*)::int, 0) >= 0 FROM upd_ingested)
    RETURNING 1
  )
  SELECT
    (SELECT count(*)::bigint FROM upd_ingested),
    (SELECT count(*)::bigint FROM upd_sales_losers)
  INTO n_repair, n_arch;

  RAISE NOTICE 'migration_167_sales_ingested_dup_repair: published_sale_id_repairs=%, sales_rows_archived=%',
    n_repair,
    n_arch;
END
$$;

DO $$
DECLARE
  duplicate_groups_after integer;
BEGIN
  SELECT count(*)::integer
  INTO duplicate_groups_after
  FROM (
    SELECT ingested_sale_id
    FROM lootaura_v2.sales
    WHERE ingested_sale_id IS NOT NULL
    GROUP BY ingested_sale_id
    HAVING count(*) > 1
  ) d;

  RAISE NOTICE 'migration_167_sales_ingested_dup_repair: duplicate_nonnull_groups_after=% (expect 0 before unique index)',
    duplicate_groups_after;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_ingested_sale_id_unique
  ON lootaura_v2.sales (ingested_sale_id)
  WHERE ingested_sale_id IS NOT NULL;

DO $$
BEGIN
  RAISE NOTICE 'migration_167_sales_ingested_dup_repair: ensured idx_sales_ingested_sale_id_unique (IF NOT EXISTS)';
END
$$;
