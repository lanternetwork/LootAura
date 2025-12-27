-- 124_create_stripe_webhook_events_table.sql
-- Create table to track processed Stripe webhook events for idempotency

CREATE TABLE IF NOT EXISTS lootaura_v2.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,  -- Stripe event.id
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  error_message text,
  retry_count integer NOT NULL DEFAULT 0
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id ON lootaura_v2.stripe_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type ON lootaura_v2.stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at ON lootaura_v2.stripe_webhook_events(processed_at);

-- RLS Policies
ALTER TABLE lootaura_v2.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access (webhook processing is server-side only)
CREATE POLICY stripe_webhook_events_service_role_all ON lootaura_v2.stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No authenticated or anon access (webhook events are internal)
-- (No policy needed - default deny)

-- Grant permissions
GRANT ALL ON lootaura_v2.stripe_webhook_events TO service_role;

COMMENT ON TABLE lootaura_v2.stripe_webhook_events IS 
  'Tracks processed Stripe webhook events for idempotency. Prevents duplicate processing of the same event.';
COMMENT ON COLUMN lootaura_v2.stripe_webhook_events.event_id IS 
  'Stripe event.id - unique identifier for the webhook event. Used for idempotency checks.';

