-- Create analytics_events table in lootaura_v2 schema
-- This table stores analytics events (views, saves, clicks, shares, favorites) for sales

-- Create table if not exists
CREATE TABLE IF NOT EXISTS lootaura_v2.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL, -- denormalized from sales.owner_id for fast owner queries
  user_id uuid NULL,
  event_type text NOT NULL CHECK (event_type IN ('view','save','click','share','favorite')),
  ts timestamptz NOT NULL DEFAULT now(),
  referrer text NULL,
  user_agent text NULL,
  is_test boolean NOT NULL DEFAULT false
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ae_sale_ts ON lootaura_v2.analytics_events (sale_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ae_owner_ts ON lootaura_v2.analytics_events (owner_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ae_type_ts ON lootaura_v2.analytics_events (event_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ae_is_test ON lootaura_v2.analytics_events (is_test);

-- Enable RLS
ALTER TABLE lootaura_v2.analytics_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Owners may select their rows (including test events)
DROP POLICY IF EXISTS ae_owner_select ON lootaura_v2.analytics_events;
CREATE POLICY ae_owner_select ON lootaura_v2.analytics_events
  FOR SELECT
  USING (owner_id = auth.uid());

-- Grant privileges to service_role (for admin operations)
-- Note: Insert/Delete restricted to service role; no policy needed (we'll use service role via admin API)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lootaura_v2.analytics_events TO service_role;

