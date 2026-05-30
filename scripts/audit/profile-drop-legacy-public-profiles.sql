-- Phase 8 — Drop legacy public.profiles (MANUAL ONLY)
--
-- Do NOT add this file to supabase/migrations/ until:
--   1. Migration 216 applied (if Phase 1 gate required Phase 6)
--   2. profile-phase6-post-migration-verify.sql shows only_public = 0
--   3. Engineering + DBA sign-off on PHASE8_LEGACY_TABLE_DROP.md
--
-- Run in Supabase SQL Editor with a role that can DROP tables.
-- This script FAILS CLOSED if any user exists only in public.profiles.

DO $$
DECLARE
  only_public bigint;
  public_count bigint;
  v2_count bigint;
BEGIN
  SELECT COUNT(*)::bigint
  INTO only_public
  FROM public.profiles p
  LEFT JOIN lootaura_v2.profiles v ON v.id = p.id
  WHERE v.id IS NULL;

  SELECT COUNT(*)::bigint INTO public_count FROM public.profiles;
  SELECT COUNT(*)::bigint INTO v2_count FROM lootaura_v2.profiles;

  IF only_public > 0 THEN
    RAISE EXCEPTION
      'Phase 8 blocked: % profile row(s) exist only in public.profiles. Run migration 216 and re-verify.',
      only_public;
  END IF;

  RAISE NOTICE 'Phase 8 preflight OK: public.profiles=%, lootaura_v2.profiles=%, only_public=%',
    public_count, v2_count, only_public;
END $$;

-- Drop RLS policy from 001_initial_schema.sql (name is stable in repo)
DROP POLICY IF EXISTS "Users manage profile" ON public.profiles;

DROP TABLE IF EXISTS public.profiles CASCADE;

-- Confirm removal
SELECT
  to_regclass('public.profiles') IS NULL AS legacy_public_profiles_dropped,
  to_regclass('lootaura_v2.profiles') IS NOT NULL AS v2_profiles_still_exists,
  to_regclass('public.profiles_v2') IS NOT NULL AS profiles_v2_view_still_exists;
