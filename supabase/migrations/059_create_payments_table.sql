-- Create payments table for Stripe-backed promotions

CREATE TABLE IF NOT EXISTS lootaura_v2.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  sale_id uuid REFERENCES lootaura_v2.sales(id),
  stripe_payment_intent_id text,
  stripe_payment_method_id text,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL,
  purpose text NOT NULL,
  raw_event jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lootaura_v2_payments_user_id_idx ON lootaura_v2.payments (user_id);
CREATE INDEX IF NOT EXISTS lootaura_v2_payments_sale_id_idx ON lootaura_v2.payments (sale_id);
CREATE INDEX IF NOT EXISTS lootaura_v2_payments_stripe_pi_idx ON lootaura_v2.payments (stripe_payment_intent_id);

ALTER TABLE lootaura_v2.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_owner_select ON lootaura_v2.payments;
CREATE POLICY payments_owner_select ON lootaura_v2.payments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS payments_owner_insert ON lootaura_v2.payments;
CREATE POLICY payments_owner_insert ON lootaura_v2.payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);


