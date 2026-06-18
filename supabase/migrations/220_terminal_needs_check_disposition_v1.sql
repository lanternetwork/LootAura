-- TERMINAL_NEEDS_CHECK_DISPOSITION_V1: split terminal address inventory into active vs archived.

BEGIN;

ALTER TABLE lootaura_v2.ingested_sales
  DROP CONSTRAINT IF EXISTS ingested_sales_address_status_check;

ALTER TABLE lootaura_v2.ingested_sales
  ADD CONSTRAINT ingested_sales_address_status_check
  CHECK (
    address_status IN (
      'address_available',
      'address_gated',
      'address_enrichment_pending',
      'address_enrichment_retry',
      'address_unavailable_terminal',
      'address_terminal_active',
      'address_terminal_archived'
    )
  );

COMMENT ON COLUMN lootaura_v2.ingested_sales.address_status IS
  'Address lifecycle (D1 + terminal disposition v1): terminal rows use address_terminal_active/archived.';

-- Backfill legacy terminal rows into active disposition with terminalEnteredAt.
UPDATE lootaura_v2.ingested_sales s
SET
  address_status = 'address_terminal_active',
  failure_details = jsonb_set(
    COALESCE(s.failure_details, '{}'::jsonb),
    '{address_enrichment}',
    COALESCE(s.failure_details->'address_enrichment', '{}'::jsonb) || jsonb_build_object(
      'terminalEnteredAt',
      COALESCE(
        s.failure_details->'address_enrichment'->>'terminalEnteredAt',
        s.failure_details->'address_enrichment'->>'recorded_at',
        to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    ),
    true
  )
WHERE s.address_status = 'address_unavailable_terminal';

-- Archive cooled terminal-active rows (default 7d cooling).
UPDATE lootaura_v2.ingested_sales s
SET address_status = 'address_terminal_archived'
WHERE s.address_status = 'address_terminal_active'
  AND (
    COALESCE(
      (s.failure_details->'address_enrichment'->>'terminalEnteredAt')::timestamptz,
      s.updated_at
    ) < now() - interval '7 days'
  );

CREATE INDEX IF NOT EXISTS idx_ingested_sales_address_terminal_active
  ON lootaura_v2.ingested_sales (address_status, updated_at)
  WHERE address_status = 'address_terminal_active';

CREATE INDEX IF NOT EXISTS idx_ingested_sales_address_terminal_archived
  ON lootaura_v2.ingested_sales (address_status)
  WHERE address_status = 'address_terminal_archived';

COMMIT;
