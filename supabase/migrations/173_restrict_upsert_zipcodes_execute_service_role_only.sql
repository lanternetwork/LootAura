BEGIN;

-- Security: public.upsert_zipcodes(jsonb) is SECURITY DEFINER and bulk-writes lootaura_v2.zipcodes.
-- Migration 053 granted EXECUTE to anon and authenticated, allowing any PostgREST client with the
-- anon key to invoke the RPC. Admin ZIP import uses the service-role server client only.
-- Execute is restricted to service_role; revoke inherited/broad access first (see 154 pattern).

REVOKE EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) TO service_role;

COMMENT ON FUNCTION public.upsert_zipcodes(jsonb) IS
  'Bulk upsert ZIP rows into lootaura_v2.zipcodes (SECURITY DEFINER). EXECUTE is service_role only; call from server via admin ZIP import (service-role Supabase client), not from browser anon/authenticated RPC.';

COMMIT;
