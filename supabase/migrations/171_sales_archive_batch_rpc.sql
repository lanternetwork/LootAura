-- Phase 2/3: SQL-side batched archive for ended sales (no full-table app loads).
-- Transitional: rows with ends_at use instant comparison; rows with ends_at IS NULL use legacy UTC-date rules.
-- Rollback: drop both functions; restore prior app-only archive behavior via redeploy if needed.

CREATE OR REPLACE FUNCTION lootaura_v2.archive_sales_ended_batch(
  p_now timestamptz,
  p_batch_limit int
)
RETURNS TABLE(archived_via_ends_at int, archived_via_legacy int)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = lootaura_v2, pg_catalog
AS $fn$
DECLARE
  v_today date;
  n1 int := 0;
  n2 int := 0;
BEGIN
  IF p_batch_limit IS NULL OR p_batch_limit < 1 THEN
    RAISE EXCEPTION 'p_batch_limit must be >= 1';
  END IF;

  v_today := (p_now AT TIME ZONE 'UTC')::date;

  WITH picked AS (
    SELECT s.id
    FROM lootaura_v2.sales s
    WHERE s.status IN ('published', 'active')
      AND s.archived_at IS NULL
      AND s.ends_at IS NOT NULL
      AND s.ends_at < p_now
    ORDER BY s.id
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE lootaura_v2.sales s
  SET
    status = 'archived',
    archived_at = p_now,
    updated_at = p_now
  FROM picked
  WHERE s.id = picked.id;

  GET DIAGNOSTICS n1 = ROW_COUNT;

  WITH picked2 AS (
    SELECT s.id
    FROM lootaura_v2.sales s
    WHERE s.status IN ('published', 'active')
      AND s.archived_at IS NULL
      AND s.ends_at IS NULL
      AND (
        (s.date_end IS NOT NULL AND s.date_end <= v_today)
        OR (s.date_end IS NULL AND s.date_start IS NOT NULL AND s.date_start < v_today)
      )
    ORDER BY s.id
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE lootaura_v2.sales s
  SET
    status = 'archived',
    archived_at = p_now,
    updated_at = p_now
  FROM picked2
  WHERE s.id = picked2.id;

  GET DIAGNOSTICS n2 = ROW_COUNT;

  -- RETURN QUERY ensures exactly one result row (some clients showed "no rows" with OUT-param + RETURN NEXT).
  RETURN QUERY SELECT n1 AS archived_via_ends_at, n2 AS archived_via_legacy;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION lootaura_v2.archive_sales_ended_batch(timestamptz, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.archive_sales_ended_batch(timestamptz, int) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.archive_sales_ended_batch(timestamptz, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION lootaura_v2.archive_sales_ended_batch(timestamptz, int) TO service_role;

COMMENT ON FUNCTION lootaura_v2.archive_sales_ended_batch(timestamptz, int) IS
  'Archives up to p_batch_limit sales via ends_at < p_now, then up to p_batch_limit via legacy calendar rules when ends_at IS NULL. Returns per-branch row counts.';

CREATE OR REPLACE FUNCTION lootaura_v2.count_sales_pending_archive(p_now timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = lootaura_v2, pg_catalog
AS $fn$
  SELECT jsonb_build_object(
    'today_utc_date', to_char((p_now AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD'),
    'pending_via_ends_at',
      (
        SELECT count(*)::bigint
        FROM lootaura_v2.sales s
        WHERE s.status IN ('published', 'active')
          AND s.archived_at IS NULL
          AND s.ends_at IS NOT NULL
          AND s.ends_at < p_now
      ),
    'pending_via_legacy',
      (
        SELECT count(*)::bigint
        FROM lootaura_v2.sales s
        WHERE s.status IN ('published', 'active')
          AND s.archived_at IS NULL
          AND s.ends_at IS NULL
          AND (
            (s.date_end IS NOT NULL AND s.date_end <= (p_now AT TIME ZONE 'UTC')::date)
            OR (
              s.date_end IS NULL
              AND s.date_start IS NOT NULL
              AND s.date_start < (p_now AT TIME ZONE 'UTC')::date
            )
          )
      ),
    'published_past_ends_at',
      (
        SELECT count(*)::bigint
        FROM lootaura_v2.sales s
        WHERE s.status = 'published'
          AND s.archived_at IS NULL
          AND s.ends_at IS NOT NULL
          AND s.ends_at < p_now
      ),
    'active_past_ends_at',
      (
        SELECT count(*)::bigint
        FROM lootaura_v2.sales s
        WHERE s.status = 'active'
          AND s.archived_at IS NULL
          AND s.ends_at IS NOT NULL
          AND s.ends_at < p_now
      ),
    'suspicious_ends_before_starts',
      (
        SELECT count(*)::bigint
        FROM lootaura_v2.sales s
        WHERE s.archived_at IS NULL
          AND s.ends_at IS NOT NULL
          AND s.starts_at IS NOT NULL
          AND s.ends_at < s.starts_at
      )
  );
$fn$;

REVOKE EXECUTE ON FUNCTION lootaura_v2.count_sales_pending_archive(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.count_sales_pending_archive(timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.count_sales_pending_archive(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION lootaura_v2.count_sales_pending_archive(timestamptz) TO service_role;

COMMENT ON FUNCTION lootaura_v2.count_sales_pending_archive(timestamptz) IS
  'Read-only counts for archive backlog, stale published (past ends_at), and suspicious ordering (ends_at < starts_at).';
