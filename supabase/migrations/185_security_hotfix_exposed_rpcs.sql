-- P0 security hotfix: profile RPC ownership + least-privilege EXECUTE on worker RPCs.
-- Codifies production permission fixes; re-applies REVOKE after any prior DROP/CREATE on claim RPCs.
--
-- Verification (run after apply; each should return 0 rows):
--
--   SELECT routine_schema, routine_name, grantee
--   FROM information_schema.routine_privileges
--   WHERE privilege_type = 'EXECUTE'
--     AND grantee IN ('PUBLIC', 'anon')
--     AND (
--       (routine_schema = 'public' AND routine_name IN ('get_profile', 'update_profile', 'update_profile_v2'))
--       OR (routine_schema = 'lootaura_v2' AND routine_name IN (
--         'claim_ingested_sales_for_geocoding',
--         'claim_ingested_sales_for_address_enrichment',
--         'claim_ingested_sales_for_image_enrichment',
--         'claim_ingested_sales_for_publish',
--         'cleanup_old_analytics_events'
--       ))
--     );
--
--   SELECT routine_schema, routine_name, grantee
--   FROM information_schema.routine_privileges
--   WHERE privilege_type = 'EXECUTE'
--     AND grantee = 'authenticated'
--     AND routine_schema = 'lootaura_v2'
--     AND routine_name LIKE 'claim_ingested_sales_for_%';
--
-- Profile RPCs: authenticated only. Claim/cleanup: service_role only.

BEGIN;

-- ---------------------------------------------------------------------------
-- Profile RPCs: owner-only (auth.uid() = p_user_id), authenticated EXECUTE only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lootaura_v2
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'profile access denied' USING ERRCODE = '42501';
  END IF;

  SELECT row_to_json(p.*)::jsonb
  INTO v_result
  FROM lootaura_v2.profiles p
  WHERE p.id = p_user_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_profile(
  p_user_id uuid,
  p_avatar_url text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_location_city text DEFAULT NULL,
  p_location_region text DEFAULT NULL,
  p_social_links jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lootaura_v2
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'profile access denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM lootaura_v2.profiles WHERE id = p_user_id) THEN
    INSERT INTO lootaura_v2.profiles (id, created_at, updated_at)
    VALUES (p_user_id, now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF p_avatar_url IS NOT NULL THEN
    UPDATE lootaura_v2.profiles SET avatar_url = p_avatar_url WHERE id = p_user_id;
  END IF;

  IF p_full_name IS NOT NULL THEN
    UPDATE lootaura_v2.profiles SET full_name = p_full_name WHERE id = p_user_id;
  END IF;

  IF p_display_name IS NOT NULL THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'lootaura_v2'
          AND table_name = 'profiles'
          AND column_name = 'display_name'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN display_name text;
      END IF;
      UPDATE lootaura_v2.profiles SET display_name = p_display_name WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update display_name: %', SQLERRM;
    END;
  END IF;

  IF p_bio IS NOT NULL OR (p_bio IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles' AND column_name = 'bio'
  )) THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles' AND column_name = 'bio'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN bio text;
      END IF;
      UPDATE lootaura_v2.profiles SET bio = p_bio WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update bio: %', SQLERRM;
    END;
  END IF;

  IF p_location_city IS NOT NULL OR (p_location_city IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles' AND column_name = 'location_city'
  )) THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles' AND column_name = 'location_city'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN location_city text;
      END IF;
      UPDATE lootaura_v2.profiles SET location_city = p_location_city WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update location_city: %', SQLERRM;
    END;
  END IF;

  IF p_location_region IS NOT NULL OR (p_location_region IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles' AND column_name = 'location_region'
  )) THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles' AND column_name = 'location_region'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN location_region text;
      END IF;
      UPDATE lootaura_v2.profiles SET location_region = p_location_region WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update location_region: %', SQLERRM;
    END;
  END IF;

  IF p_social_links IS NOT NULL OR (p_social_links IS NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles' AND column_name = 'social_links'
  )) THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'lootaura_v2' AND table_name = 'profiles' AND column_name = 'social_links'
      ) THEN
        ALTER TABLE lootaura_v2.profiles ADD COLUMN social_links jsonb DEFAULT '{}'::jsonb;
      END IF;
      UPDATE lootaura_v2.profiles
      SET social_links = COALESCE(p_social_links, '{}'::jsonb)
      WHERE id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update social_links: %', SQLERRM;
    END;
  END IF;

  BEGIN
    UPDATE lootaura_v2.profiles SET updated_at = now() WHERE id = p_user_id;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  SELECT row_to_json(p.*)::jsonb
  INTO v_result
  FROM lootaura_v2.profiles p
  WHERE p.id = p_user_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Profile not found after update: %', p_user_id;
  END IF;

  RETURN v_result;
END;
$$;

-- Legacy/alternate profile RPC present in some environments (production).
-- DROP required: prod definition may use a different return type than jsonb (42P13 on OR REPLACE).
DROP FUNCTION IF EXISTS public.update_profile_v2(uuid, text, text, text, text, text);

CREATE FUNCTION public.update_profile_v2(
  p_user_id uuid,
  p_display_name text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_location_city text DEFAULT NULL,
  p_location_region text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, lootaura_v2
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'profile access denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM lootaura_v2.profiles WHERE id = p_user_id) THEN
    INSERT INTO lootaura_v2.profiles (id, created_at, updated_at)
    VALUES (p_user_id, now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF p_avatar_url IS NOT NULL THEN
    UPDATE lootaura_v2.profiles SET avatar_url = p_avatar_url WHERE id = p_user_id;
  END IF;

  IF p_display_name IS NOT NULL THEN
    UPDATE lootaura_v2.profiles SET display_name = p_display_name WHERE id = p_user_id;
  END IF;

  IF p_bio IS NOT NULL THEN
    UPDATE lootaura_v2.profiles SET bio = p_bio WHERE id = p_user_id;
  END IF;

  IF p_location_city IS NOT NULL THEN
    UPDATE lootaura_v2.profiles SET location_city = p_location_city WHERE id = p_user_id;
  END IF;

  IF p_location_region IS NOT NULL THEN
    UPDATE lootaura_v2.profiles SET location_region = p_location_region WHERE id = p_user_id;
  END IF;

  UPDATE lootaura_v2.profiles SET updated_at = now() WHERE id = p_user_id;

  SELECT row_to_json(p.*)::jsonb
  INTO v_result
  FROM lootaura_v2.profiles p
  WHERE p.id = p_user_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Profile not found after update: %', p_user_id;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_profile(uuid) IS
  'Owner-only profile read (auth.uid() = p_user_id). EXECUTE: authenticated only.';

COMMENT ON FUNCTION public.update_profile(uuid, text, text, text, text, text, text, jsonb) IS
  'Owner-only profile update (auth.uid() = p_user_id). EXECUTE: authenticated only.';

COMMENT ON FUNCTION public.update_profile_v2(uuid, text, text, text, text, text) IS
  'Owner-only profile update v2 (auth.uid() = p_user_id). EXECUTE: authenticated only.';

REVOKE EXECUTE ON FUNCTION public.get_profile(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_profile(uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_profile(uuid, text, text, text, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_profile_v2(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_profile_v2(uuid, text, text, text, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile(uuid, text, text, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_v2(uuid, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ingestion claim RPCs: service_role only + hardened search_path (no public)
-- ---------------------------------------------------------------------------

ALTER FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer)
  SET search_path = lootaura_v2, pg_catalog;

ALTER FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer)
  SET search_path = lootaura_v2, pg_catalog;

ALTER FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer)
  SET search_path = lootaura_v2, pg_catalog;

ALTER FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer)
  SET search_path = lootaura_v2, pg_catalog;

REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_geocoding(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_address_enrichment(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_image_enrichment(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_publish(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Analytics cleanup: service_role only + hardened search_path
-- ---------------------------------------------------------------------------

ALTER FUNCTION lootaura_v2.cleanup_old_analytics_events()
  SET search_path = lootaura_v2, pg_catalog;

REVOKE EXECUTE ON FUNCTION lootaura_v2.cleanup_old_analytics_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lootaura_v2.cleanup_old_analytics_events() FROM anon;
REVOKE EXECUTE ON FUNCTION lootaura_v2.cleanup_old_analytics_events() FROM authenticated;

GRANT EXECUTE ON FUNCTION lootaura_v2.cleanup_old_analytics_events() TO service_role;

COMMIT;
