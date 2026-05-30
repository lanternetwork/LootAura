-- Phase 8 — Drop legacy public.profiles
--
-- Canonical deploy path: supabase/migrations/217_drop_legacy_public_profiles.sql
-- Use this file for one-off runs in SQL Editor (same logic as migration 217).
--
-- PREREQUISITES: migration 216 applied; only_public = 0 (see post-verify SQL).

DO $$
DECLARE
  only_public bigint;
  public_count bigint;
  v2_count bigint;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'Phase 8: public.profiles already dropped, skipping';
    RETURN;
  END IF;

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

  DROP POLICY IF EXISTS "Users manage profile" ON public.profiles;
  DROP TABLE public.profiles CASCADE;
END $$;

-- Confirm removal
SELECT
  to_regclass('public.profiles') IS NULL AS legacy_public_profiles_dropped,
  to_regclass('lootaura_v2.profiles') IS NOT NULL AS v2_profiles_still_exists,
  to_regclass('public.profiles_v2') IS NOT NULL AS profiles_v2_view_still_exists;
