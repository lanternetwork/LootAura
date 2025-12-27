-- 120_add_featured_inclusion_tracking.sql
-- Milestone 2: Featured inclusion tracking for fairness and analytics
--
-- This migration adds:
-- 1. featured_inclusions table (recipient-level exposure state)
-- 2. featured_inclusion_rollups table (sale-level aggregates)
--
-- Purpose:
-- - Track which sales were shown to which recipients (fairness rotation)
-- - Provide seller reporting on "featured to X users" metrics
-- - Support deterministic selection with fairness bias
--
-- Constraints:
-- - Idempotent: safe to run multiple times
-- - Forward-only: no destructive changes
-- - RLS enabled with privacy-focused policies

-- ============================================================================
-- PART 1: Recipient-Level Inclusion Tracking
-- ============================================================================

-- Create featured_inclusions table
CREATE TABLE IF NOT EXISTS lootaura_v2.featured_inclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE,
  recipient_profile_id uuid NOT NULL REFERENCES lootaura_v2.profiles(id) ON DELETE CASCADE,
  week_key text NOT NULL, -- ISO week format: "2025-W03" or date-based: "2025-01-16"
  times_shown int NOT NULL DEFAULT 1,
  last_shown_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT unique_recipient_sale_week UNIQUE (recipient_profile_id, sale_id, week_key)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_featured_inclusions_recipient_week 
  ON lootaura_v2.featured_inclusions(recipient_profile_id, week_key, times_shown ASC);

CREATE INDEX IF NOT EXISTS idx_featured_inclusions_sale 
  ON lootaura_v2.featured_inclusions(sale_id);

CREATE INDEX IF NOT EXISTS idx_featured_inclusions_week 
  ON lootaura_v2.featured_inclusions(week_key);

-- Index for fairness queries (least-shown sales for a recipient in a week)
CREATE INDEX IF NOT EXISTS idx_featured_inclusions_fairness 
  ON lootaura_v2.featured_inclusions(recipient_profile_id, week_key, times_shown ASC, last_shown_at ASC);

-- Enable RLS
ALTER TABLE lootaura_v2.featured_inclusions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Deny all direct access (privacy protection)
-- Recipient-level data is sensitive - only service_role can access
DROP POLICY IF EXISTS no_direct_access_featured_inclusions ON lootaura_v2.featured_inclusions;
CREATE POLICY no_direct_access_featured_inclusions ON lootaura_v2.featured_inclusions
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY no_direct_access_featured_inclusions ON lootaura_v2.featured_inclusions IS 
  'Denies all direct access to recipient-level inclusion data. Only service_role (backend jobs) can access. Sellers cannot see which recipients saw their sales.';

-- Grant service_role full access (for background jobs and selection engine)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lootaura_v2.featured_inclusions TO service_role;

-- ============================================================================
-- PART 2: Sale-Level Inclusion Rollups
-- ============================================================================

-- Create featured_inclusion_rollups table
CREATE TABLE IF NOT EXISTS lootaura_v2.featured_inclusion_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE,
  unique_recipients_total int NOT NULL DEFAULT 0,
  total_inclusions_total int NOT NULL DEFAULT 0,
  last_featured_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT unique_sale_rollup UNIQUE (sale_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_featured_inclusion_rollups_sale 
  ON lootaura_v2.featured_inclusion_rollups(sale_id);

CREATE INDEX IF NOT EXISTS idx_featured_inclusion_rollups_last_featured 
  ON lootaura_v2.featured_inclusion_rollups(last_featured_at DESC NULLS LAST);

-- Enable RLS
ALTER TABLE lootaura_v2.featured_inclusion_rollups ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Sellers can read aggregates for their own sales
DROP POLICY IF EXISTS featured_inclusion_rollups_owner_read ON lootaura_v2.featured_inclusion_rollups;
CREATE POLICY featured_inclusion_rollups_owner_read ON lootaura_v2.featured_inclusion_rollups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lootaura_v2.sales
      WHERE id = sale_id AND owner_id = auth.uid()
    )
  );

COMMENT ON POLICY featured_inclusion_rollups_owner_read ON lootaura_v2.featured_inclusion_rollups IS 
  'Allows sellers to read aggregate inclusion metrics for their own sales. Does not expose recipient-level data.';

-- Grant service_role full access (for background jobs and updates)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lootaura_v2.featured_inclusion_rollups TO service_role;

-- Grant authenticated users SELECT (RLS will filter to own sales)
GRANT SELECT ON TABLE lootaura_v2.featured_inclusion_rollups TO authenticated;

