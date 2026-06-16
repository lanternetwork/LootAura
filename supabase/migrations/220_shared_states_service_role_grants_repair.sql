-- Idempotent repair for lootaura_v2.shared_states service_role access (see migration 193).
-- Safe to re-run when share API inserts fail with PostgREST permission errors.

DROP POLICY IF EXISTS shared_states_service_role_all ON lootaura_v2.shared_states;
CREATE POLICY shared_states_service_role_all ON lootaura_v2.shared_states
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON lootaura_v2.shared_states TO service_role;
