-- Create shared_states table for shareable links
CREATE TABLE IF NOT EXISTS shared_states (
  id TEXT PRIMARY KEY, -- Short ID (nanoid)
  state_json JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_shared_states_created_at ON shared_states(created_at);

-- No RLS needed - this is a public table for shareable links
-- Note: No user_id column to keep it anonymous

-- Function to clean up old shared states (for future cron job)
CREATE OR REPLACE FUNCTION cleanup_old_shared_states()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete entries older than 30 days
  DELETE FROM shared_states 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
