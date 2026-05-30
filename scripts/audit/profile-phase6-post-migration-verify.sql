-- Phase 6 post-migration verification (READ-ONLY)
-- Run after applying migration 216_migrate_public_profiles_to_v2.sql
-- Paste results into docs/profile-architecture/PHASE6_PUBLIC_TO_V2_MIGRATION.md

SELECT 'post6_only_public_remaining' AS report_section;

SELECT COUNT(*)::bigint AS users_still_only_in_public
FROM public.profiles p
LEFT JOIN lootaura_v2.profiles v ON v.id = p.id
WHERE v.id IS NULL;

SELECT 'post6_display_name_mismatch_sample' AS report_section;

SELECT
  p.id,
  p.display_name AS public_display_name,
  v.display_name AS v2_display_name
FROM public.profiles p
INNER JOIN lootaura_v2.profiles v ON v.id = p.id
WHERE COALESCE(NULLIF(trim(p.display_name), ''), '__NULL__')
    <> COALESCE(NULLIF(trim(v.display_name), ''), NULLIF(trim(v.full_name), ''), '__NULL__')
ORDER BY p.id
LIMIT 50;

SELECT 'post6_avatar_mismatch_sample' AS report_section;

SELECT
  p.id,
  p.avatar_url AS public_avatar_url,
  v.avatar_url AS v2_avatar_url
FROM public.profiles p
INNER JOIN lootaura_v2.profiles v ON v.id = p.id
WHERE COALESCE(NULLIF(trim(p.avatar_url), ''), '__NULL__')
    <> COALESCE(NULLIF(trim(v.avatar_url), ''), '__NULL__')
ORDER BY p.id
LIMIT 50;

SELECT 'post6_gate_summary' AS report_section;

SELECT
  (SELECT COUNT(*)::bigint
   FROM public.profiles p
   LEFT JOIN lootaura_v2.profiles v ON v.id = p.id
   WHERE v.id IS NULL) AS only_public,
  (SELECT COUNT(*)::bigint
   FROM public.profiles p
   INNER JOIN lootaura_v2.profiles v ON v.id = p.id) AS in_both;
