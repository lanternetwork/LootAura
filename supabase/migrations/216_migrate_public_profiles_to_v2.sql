-- Phase 6: Merge legacy public.profiles into lootaura_v2.profiles
--
-- PREREQUISITES (human gate — do not merge to main until signed off):
--   1. Run scripts/audit/profile-divergence-audit.sql in production
--   2. Complete docs/profile-architecture/PHASE1_PRODUCTION_DIVERGENCE_REPORT.md
--   3. Apply only when users_only_public > 0 OR material field drift in users_in_both
--
-- SAFE TO RE-RUN: inserts use ON CONFLICT DO NOTHING; updates only fill nulls or
-- take public values when public.updated_at is strictly newer than v2.updated_at.
-- Does NOT drop public.profiles (Phase 7 retirement is a separate migration).
--
-- Join key: public.profiles.id = lootaura_v2.profiles.id (= auth.users.id)

-- ---------------------------------------------------------------------------
-- A. Insert rows that exist only in public.profiles
-- ---------------------------------------------------------------------------
INSERT INTO lootaura_v2.profiles (
  id,
  full_name,
  display_name,
  avatar_url,
  bio,
  location_city,
  location_region,
  created_at,
  updated_at
)
SELECT
  p.id,
  NULLIF(trim(p.display_name), ''),
  NULLIF(trim(p.display_name), ''),
  NULLIF(trim(p.avatar_url), ''),
  NULLIF(trim(p.bio), ''),
  NULLIF(trim(p.location_city), ''),
  NULLIF(trim(p.location_region), ''),
  COALESCE(p.created_at, now()),
  COALESCE(p.updated_at, p.created_at, now())
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM lootaura_v2.profiles v WHERE v.id = p.id
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- B. Merge overlapping rows (public strictly newer wins; else keep non-null v2)
-- ---------------------------------------------------------------------------
UPDATE lootaura_v2.profiles v
SET
  display_name = CASE
    WHEN p.updated_at IS NOT NULL
      AND p.updated_at > COALESCE(v.updated_at, '-infinity'::timestamptz)
      AND NULLIF(trim(p.display_name), '') IS NOT NULL
    THEN trim(p.display_name)
    ELSE COALESCE(NULLIF(trim(v.display_name), ''), NULLIF(trim(v.full_name), ''), NULLIF(trim(p.display_name), ''))
  END,
  full_name = CASE
    WHEN p.updated_at IS NOT NULL
      AND p.updated_at > COALESCE(v.updated_at, '-infinity'::timestamptz)
      AND NULLIF(trim(p.display_name), '') IS NOT NULL
    THEN COALESCE(NULLIF(trim(v.full_name), ''), trim(p.display_name))
    ELSE COALESCE(NULLIF(trim(v.full_name), ''), NULLIF(trim(v.display_name), ''))
  END,
  avatar_url = CASE
    WHEN p.updated_at IS NOT NULL
      AND p.updated_at > COALESCE(v.updated_at, '-infinity'::timestamptz)
      AND NULLIF(trim(p.avatar_url), '') IS NOT NULL
    THEN trim(p.avatar_url)
    ELSE COALESCE(NULLIF(trim(v.avatar_url), ''), NULLIF(trim(p.avatar_url), ''))
  END,
  bio = CASE
    WHEN p.updated_at IS NOT NULL
      AND p.updated_at > COALESCE(v.updated_at, '-infinity'::timestamptz)
      AND NULLIF(trim(p.bio), '') IS NOT NULL
    THEN trim(p.bio)
    ELSE COALESCE(NULLIF(trim(v.bio), ''), NULLIF(trim(p.bio), ''))
  END,
  location_city = CASE
    WHEN p.updated_at IS NOT NULL
      AND p.updated_at > COALESCE(v.updated_at, '-infinity'::timestamptz)
      AND NULLIF(trim(p.location_city), '') IS NOT NULL
    THEN trim(p.location_city)
    ELSE COALESCE(NULLIF(trim(v.location_city), ''), NULLIF(trim(p.location_city), ''))
  END,
  location_region = CASE
    WHEN p.updated_at IS NOT NULL
      AND p.updated_at > COALESCE(v.updated_at, '-infinity'::timestamptz)
      AND NULLIF(trim(p.location_region), '') IS NOT NULL
    THEN trim(p.location_region)
    ELSE COALESCE(NULLIF(trim(v.location_region), ''), NULLIF(trim(p.location_region), ''))
  END,
  updated_at = GREATEST(
    COALESCE(v.updated_at, v.created_at, '-infinity'::timestamptz),
    COALESCE(p.updated_at, p.created_at, '-infinity'::timestamptz)
  )
FROM public.profiles p
WHERE p.id = v.id;

-- ---------------------------------------------------------------------------
-- C. Backfill member_since for newly inserted rows (matches migration 135 pattern)
-- ---------------------------------------------------------------------------
UPDATE lootaura_v2.profiles p
SET member_since = u.created_at
FROM auth.users u
WHERE p.id = u.id
  AND p.member_since IS NULL;
