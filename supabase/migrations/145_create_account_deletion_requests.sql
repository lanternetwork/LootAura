-- 145_create_account_deletion_requests.sql
-- Create account_deletion_requests table for user account deletion requests
-- Users can submit deletion requests; admins process them via service role

CREATE TABLE IF NOT EXISTS lootaura_v2.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NULL, -- Optional reason provided by user (max length enforced at API layer)
  status text NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  processed_at timestamptz NULL,
  processed_by uuid NULL, -- Admin UUID (no FK constraint for now)
  notes text NULL -- Admin notes
);

-- Partial unique index: one pending request per user
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_user_pending
  ON lootaura_v2.account_deletion_requests (user_id)
  WHERE status = 'pending';

-- Index for admin querying by status and creation time
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_status_created
  ON lootaura_v2.account_deletion_requests (status, created_at DESC);

-- Enable RLS
ALTER TABLE lootaura_v2.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies: owner-only access
CREATE POLICY "select own deletion requests"
  ON lootaura_v2.account_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "insert own deletion requests"
  ON lootaura_v2.account_deletion_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION lootaura_v2.update_account_deletion_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_account_deletion_requests_updated_at
  BEFORE UPDATE ON lootaura_v2.account_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION lootaura_v2.update_account_deletion_requests_updated_at();

-- Comments
COMMENT ON TABLE lootaura_v2.account_deletion_requests IS 
  'User requests for account deletion. Processed by admins via service role.';

COMMENT ON COLUMN lootaura_v2.account_deletion_requests.status IS 
  'pending: awaiting admin review. processing: deletion in progress. completed: account deleted. cancelled: request cancelled.';
