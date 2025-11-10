-- Grant USAGE on lootaura_v2 schema to service_role
-- This allows the service role (admin client) to access tables in the schema
-- The service role is used for writes that bypass RLS (after auth verification in API routes)

GRANT USAGE ON SCHEMA lootaura_v2 TO service_role;

-- Also grant ALL privileges on all tables in the schema to service_role
-- This ensures the service role can perform INSERT, UPDATE, DELETE operations
GRANT ALL ON ALL TABLES IN SCHEMA lootaura_v2 TO service_role;

-- Grant privileges on future tables as well
ALTER DEFAULT PRIVILEGES IN SCHEMA lootaura_v2 GRANT ALL ON TABLES TO service_role;

