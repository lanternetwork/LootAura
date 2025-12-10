-- Create sale_reports table for moderation system
-- Allows users to report problematic sales with reasons and details
-- Admins can review and act on reports

CREATE TABLE IF NOT EXISTS lootaura_v2.sale_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE,
  reporter_profile_id uuid NULL REFERENCES lootaura_v2.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('fraud', 'prohibited_items', 'spam', 'harassment', 'other')),
  details text NULL, -- Optional free-form details (max length enforced in application)
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  action_taken text NULL, -- e.g. 'sale_hidden', 'account_locked', 'none'
  admin_notes text NULL, -- Internal admin notes
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_sale_reports_sale_created 
  ON lootaura_v2.sale_reports(sale_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_reports_status_created 
  ON lootaura_v2.sale_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_reports_reporter 
  ON lootaura_v2.sale_reports(reporter_profile_id, created_at DESC)
  WHERE reporter_profile_id IS NOT NULL;

-- Index for auto-hide logic: count recent reports per sale
-- Note: Time-based filtering (e.g., last 7 days) is handled at query time, not in the index
-- This index supports efficient queries filtering by sale_id and ordering by created_at
CREATE INDEX IF NOT EXISTS idx_sale_reports_sale_created_recent 
  ON lootaura_v2.sale_reports(sale_id, created_at DESC);

-- Enable RLS
ALTER TABLE lootaura_v2.sale_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own reports
-- reporter_profile_id must match the authenticated user's profile
CREATE POLICY "users_can_insert_own_reports"
  ON lootaura_v2.sale_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reporter_profile_id IN (
      SELECT id FROM lootaura_v2.profiles WHERE id = auth.uid()
    )
  );

-- Policy: No SELECT for regular users (fire-and-forget reporting)
-- Users cannot view their own reports in v1
CREATE POLICY "no_user_select_reports"
  ON lootaura_v2.sale_reports
  FOR SELECT
  TO authenticated
  USING (false);

-- Policy: Service role can do everything (for admin API routes)
CREATE POLICY "service_role_all_reports"
  ON lootaura_v2.sale_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant service role access
GRANT ALL ON lootaura_v2.sale_reports TO service_role;

-- Add comment
COMMENT ON TABLE lootaura_v2.sale_reports IS 
  'User reports of problematic sales. Used for moderation and auto-hide logic.';

COMMENT ON COLUMN lootaura_v2.sale_reports.reason IS 
  'Report reason: fraud, prohibited_items, spam, harassment, other';

COMMENT ON COLUMN lootaura_v2.sale_reports.status IS 
  'Report status: open, in_review, resolved, dismissed';

COMMENT ON COLUMN lootaura_v2.sale_reports.action_taken IS 
  'Action taken by admin: sale_hidden, account_locked, none, etc.';

