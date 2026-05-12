-- Phase 1: sale listing window — authoritative instant (ends_at) + resolved IANA zone.
-- Additive only: no RLS / archive / visibility behavior changes.

ALTER TABLE lootaura_v2.sales
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS listing_timezone TEXT NULL;

COMMENT ON COLUMN lootaura_v2.sales.ends_at IS
  'Listing end instant (UTC). Populated from date_end/time_end + listing_timezone; used by future archive + visibility.';

COMMENT ON COLUMN lootaura_v2.sales.listing_timezone IS
  'IANA timezone used to interpret date_end/time_end into ends_at (ZIP+state → coords → tz-lookup; else lat/lng).';

-- Future archive worker: published/active, not archived, ends_at in the past
CREATE INDEX IF NOT EXISTS idx_sales_archive_candidate_ends_at
  ON lootaura_v2.sales (ends_at)
  WHERE status IN ('published', 'active')
    AND archived_at IS NULL
    AND ends_at IS NOT NULL;

-- Future public visibility: published rows filtered by ends_at vs now()
CREATE INDEX IF NOT EXISTS idx_sales_public_live_ends_at
  ON lootaura_v2.sales (status, archived_at, ends_at)
  WHERE status = 'published'
    AND archived_at IS NULL;

DROP VIEW IF EXISTS public.sales_v2 CASCADE;

CREATE VIEW public.sales_v2
WITH (security_invoker = true) AS
SELECT
    id,
    created_at,
    updated_at,
    owner_id,
    title,
    description,
    address,
    city,
    state,
    zip_code,
    lat,
    lng,
    geom,
    date_start,
    time_start,
    date_end,
    time_end,
    starts_at,
    ends_at,
    listing_timezone,
    status,
    is_featured,
    pricing_mode,
    privacy_mode,
    cover_image_url,
    images,
    archived_at,
    moderation_status,
    moderation_notes
FROM lootaura_v2.sales;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;

COMMENT ON VIEW public.sales_v2 IS
  'Public-facing sales view (SECURITY INVOKER). Includes ends_at + listing_timezone for listing window (phase 1).';
