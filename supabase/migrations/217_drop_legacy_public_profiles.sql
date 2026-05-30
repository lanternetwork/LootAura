-- Phase 8: Drop legacy public.profiles after Phase 6 merge (migration 216).
--
-- PREREQUISITES: profile-phase6-post-migration-verify.sql → only_public = 0
-- Idempotent: no-op if table already dropped (e.g. manual script ran first).
-- Keeps lootaura_v2.profiles and public.profiles_v2.

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

  RAISE NOTICE 'Phase 8: dropped public.profiles';
END $$;
