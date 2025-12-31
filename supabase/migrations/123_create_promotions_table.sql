-- 123_create_promotions_table.sql
-- Create promotions table for promoted listings with Stripe integration
-- Replaces is_featured placeholder in selection engine

CREATE TABLE IF NOT EXISTS lootaura_v2.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE,
  owner_profile_id uuid NOT NULL REFERENCES lootaura_v2.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'canceled', 'refunded')),
  tier text NOT NULL DEFAULT 'featured_week',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  canceled_at timestamptz,
  refunded_at timestamptz,
  CONSTRAINT ends_after_starts CHECK (ends_at > starts_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_promotions_sale_id ON lootaura_v2.promotions(sale_id);
CREATE INDEX IF NOT EXISTS idx_promotions_owner_profile_id ON lootaura_v2.promotions(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status_dates ON lootaura_v2.promotions(status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_promotions_active_window ON lootaura_v2.promotions(status, starts_at, ends_at) 
  WHERE status = 'active';

-- Unique constraint on payment intent (idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_payment_intent_unique 
  ON lootaura_v2.promotions(stripe_payment_intent_id) 
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Unique constraint on checkout session (idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_checkout_session_unique 
  ON lootaura_v2.promotions(stripe_checkout_session_id) 
  WHERE stripe_checkout_session_id IS NOT NULL;

-- RLS Policies
ALTER TABLE lootaura_v2.promotions ENABLE ROW LEVEL SECURITY;

-- Sellers can read their own promotions
CREATE POLICY promotions_owner_select ON lootaura_v2.promotions
  FOR SELECT
  TO authenticated
  USING (owner_profile_id = auth.uid());

-- Admins can read all promotions
CREATE POLICY promotions_admin_select ON lootaura_v2.promotions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lootaura_v2.profiles
      WHERE id = auth.uid()
      AND email IN (SELECT unnest(string_to_array(current_setting('app.admin_emails', true), ',')))
    )
  );

-- Service role can do everything (for server-side operations)
CREATE POLICY promotions_service_role_all ON lootaura_v2.promotions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No anon access
-- (No policy needed - default deny)

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION lootaura_v2.update_promotions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_promotions_updated_at
  BEFORE UPDATE ON lootaura_v2.promotions
  FOR EACH ROW
  EXECUTE FUNCTION lootaura_v2.update_promotions_updated_at();

-- Grant permissions
GRANT SELECT ON lootaura_v2.promotions TO authenticated;
GRANT ALL ON lootaura_v2.promotions TO service_role;

COMMENT ON TABLE lootaura_v2.promotions IS 
  'Promoted listings with Stripe payment integration. Replaces is_featured placeholder. Only service_role can INSERT/UPDATE to prevent direct seller mutations.';
COMMENT ON COLUMN lootaura_v2.promotions.status IS 
  'pending: checkout created, awaiting payment. active: payment confirmed, promotion active. expired: ends_at passed. canceled: payment failed or manually canceled. refunded: payment refunded.';
COMMENT ON COLUMN lootaura_v2.promotions.owner_profile_id IS 
  'Denormalized for RLS performance. Must match sale.owner_id.';

