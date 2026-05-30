-- Profile Architecture Phase 1 — Production Divergence Audit (READ-ONLY)
-- Run in Supabase SQL Editor (production) or psql with service role.
-- Paste section results into:
--   docs/profile-architecture/PHASE1_PRODUCTION_DIVERGENCE_REPORT.md
--   docs/profile-architecture/PHASE1_SCHEMA_VERIFICATION_REPORT.md
--
-- Do not run UPDATE/DELETE/INSERT statements from this file.

-- =============================================================================
-- A. Schema verification (public.profiles)
-- =============================================================================

SELECT 'A1_public_profiles_columns' AS report_section;

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

SELECT 'A2_lootaura_v2_profiles_columns' AS report_section;

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'lootaura_v2'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Legacy app code references public.profiles.user_id — confirm existence
SELECT 'A3_public_profiles_has_user_id_column' AS report_section;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'user_id'
) AS public_profiles_has_user_id;

SELECT 'A4_public_profiles_has_id_column' AS report_section;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'id'
) AS public_profiles_has_id;

-- =============================================================================
-- B. Row counts
-- =============================================================================

SELECT 'B1_row_counts' AS report_section;

SELECT
  (SELECT COUNT(*)::bigint FROM public.profiles) AS public_profiles_count,
  (SELECT COUNT(*)::bigint FROM lootaura_v2.profiles) AS v2_profiles_count,
  (SELECT COUNT(*)::bigint FROM auth.users) AS auth_users_count;

-- =============================================================================
-- C. User presence (join key: public.id = v2.id = auth.users.id)
-- =============================================================================

SELECT 'C1_users_only_in_public_profiles' AS report_section;

SELECT p.id
FROM public.profiles p
LEFT JOIN lootaura_v2.profiles v ON v.id = p.id
WHERE v.id IS NULL
ORDER BY p.id
LIMIT 500;

SELECT 'C2_users_only_in_v2_profiles' AS report_section;

SELECT v.id
FROM lootaura_v2.profiles v
LEFT JOIN public.profiles p ON p.id = v.id
WHERE p.id IS NULL
ORDER BY v.id
LIMIT 500;

SELECT 'C3_users_in_both_tables' AS report_section;

SELECT
  COUNT(*)::bigint AS users_in_both
FROM public.profiles p
INNER JOIN lootaura_v2.profiles v ON v.id = p.id;

SELECT 'C4_summary_presence' AS report_section;

SELECT
  (SELECT COUNT(*)::bigint
   FROM public.profiles p
   LEFT JOIN lootaura_v2.profiles v ON v.id = p.id
   WHERE v.id IS NULL) AS only_public,
  (SELECT COUNT(*)::bigint
   FROM lootaura_v2.profiles v
   LEFT JOIN public.profiles p ON p.id = v.id
   WHERE p.id IS NULL) AS only_v2,
  (SELECT COUNT(*)::bigint
   FROM public.profiles p
   INNER JOIN lootaura_v2.profiles v ON v.id = p.id) AS in_both;

-- =============================================================================
-- D. Field-level divergence (users in both)
-- =============================================================================

SELECT 'D1_display_name_mismatch' AS report_section;

SELECT
  p.id,
  p.display_name AS public_display_name,
  v.display_name AS v2_display_name,
  v.full_name AS v2_full_name
FROM public.profiles p
INNER JOIN lootaura_v2.profiles v ON v.id = p.id
WHERE COALESCE(NULLIF(trim(p.display_name), ''), '__NULL__')
    <> COALESCE(NULLIF(trim(v.display_name), ''), NULLIF(trim(v.full_name), ''), '__NULL__')
ORDER BY p.id
LIMIT 200;

SELECT 'D2_avatar_url_mismatch' AS report_section;

SELECT
  p.id,
  p.avatar_url AS public_avatar_url,
  v.avatar_url AS v2_avatar_url
FROM public.profiles p
INNER JOIN lootaura_v2.profiles v ON v.id = p.id
WHERE COALESCE(NULLIF(trim(p.avatar_url), ''), '__NULL__')
    <> COALESCE(NULLIF(trim(v.avatar_url), ''), '__NULL__')
ORDER BY p.id
LIMIT 200;

SELECT 'D3_bio_mismatch' AS report_section;

SELECT
  p.id,
  left(coalesce(p.bio, ''), 80) AS public_bio_preview,
  left(coalesce(v.bio, ''), 80) AS v2_bio_preview
FROM public.profiles p
INNER JOIN lootaura_v2.profiles v ON v.id = p.id
WHERE COALESCE(NULLIF(trim(p.bio), ''), '__NULL__')
    <> COALESCE(NULLIF(trim(v.bio), ''), '__NULL__')
ORDER BY p.id
LIMIT 200;

-- v2-only column; public may lack preferences jsonb
SELECT 'D4_preferences_column_exists_public' AS report_section;

SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'preferences'
) AS public_has_preferences;

-- If public.preferences exists, compare (run only when A reports true)
-- SELECT 'D4_preferences_mismatch' AS report_section;
-- SELECT p.id, p.preferences AS public_prefs, v.preferences AS v2_prefs
-- FROM public.profiles p
-- INNER JOIN lootaura_v2.profiles v ON v.id = p.id
-- WHERE COALESCE(p.preferences::text, '{}') <> COALESCE(v.preferences::text, '{}')
-- LIMIT 200;

SELECT 'D5_username_v2_only_mismatch_public_missing' AS report_section;

SELECT
  v.id,
  v.username AS v2_username
FROM lootaura_v2.profiles v
INNER JOIN public.profiles p ON p.id = v.id
WHERE v.username IS NOT NULL
  AND trim(v.username) <> ''
ORDER BY v.id
LIMIT 200;

-- =============================================================================
-- E. Username uniqueness / conflicts (v2)
-- =============================================================================

SELECT 'E1_duplicate_usernames_v2' AS report_section;

SELECT username, COUNT(*)::bigint AS cnt
FROM lootaura_v2.profiles
WHERE username IS NOT NULL AND trim(username) <> ''
GROUP BY username
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 50;

-- =============================================================================
-- F. Auth users without any profile row
-- =============================================================================

SELECT 'F1_auth_users_missing_v2_profile' AS report_section;

SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN lootaura_v2.profiles v ON v.id = u.id
WHERE v.id IS NULL
ORDER BY u.created_at DESC
LIMIT 200;

SELECT 'F2_auth_users_missing_public_profile' AS report_section;

SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC
LIMIT 200;

-- =============================================================================
-- G. Phase 1 gate helper (single row)
-- =============================================================================

SELECT 'G1_phase1_gate_summary' AS report_section;

SELECT
  (SELECT COUNT(*)::bigint FROM public.profiles p
   LEFT JOIN lootaura_v2.profiles v ON v.id = p.id WHERE v.id IS NULL) AS users_only_public,
  (SELECT COUNT(*)::bigint FROM lootaura_v2.profiles v
   LEFT JOIN public.profiles p ON p.id = v.id WHERE p.id IS NULL) AS users_only_v2,
  (SELECT COUNT(*)::bigint FROM public.profiles p
   INNER JOIN lootaura_v2.profiles v ON v.id = p.id
   WHERE COALESCE(NULLIF(trim(p.display_name), ''), '__NULL__')
       <> COALESCE(NULLIF(trim(v.display_name), ''), NULLIF(trim(v.full_name), ''), '__NULL__')
      OR COALESCE(NULLIF(trim(p.avatar_url), ''), '__NULL__')
       <> COALESCE(NULLIF(trim(v.avatar_url), ''), '__NULL__')
      OR COALESCE(NULLIF(trim(p.bio), ''), '__NULL__')
       <> COALESCE(NULLIF(trim(v.bio), ''), '__NULL__')
  ) AS users_in_both_with_field_drift,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
  ) AS public_has_user_id_column;
