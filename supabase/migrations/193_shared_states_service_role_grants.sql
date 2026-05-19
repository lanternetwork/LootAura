-- Migration 156 enabled RLS on lootaura_v2.shared_states without service_role policy/grants.
-- PostgREST service_role inserts (share API via getAdminDb) require explicit access like other v2 tables.

DROP POLICY IF EXISTS shared_states_service_role_all ON lootaura_v2.shared_states;
CREATE POLICY shared_states_service_role_all ON lootaura_v2.shared_states
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON lootaura_v2.shared_states TO service_role;
