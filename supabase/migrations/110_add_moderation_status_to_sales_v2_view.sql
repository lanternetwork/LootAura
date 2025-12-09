-- Add moderation_status to sales_v2 view
-- This allows queries to filter out hidden sales

-- Drop existing view
DROP VIEW IF EXISTS public.sales_v2 CASCADE;

-- Recreate view with moderation_status column
CREATE VIEW public.sales_v2 AS
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
    status,
    is_featured,
    pricing_mode,
    privacy_mode,
    cover_image_url,
    images,
    archived_at,
    moderation_status,              -- For filtering hidden sales
    moderation_notes                -- For admin reference
FROM lootaura_v2.sales;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.sales_v2 IS 
    'Canonical view of sales table. Includes owner_id for owner queries and RLS. Hidden sales (moderation_status = hidden_by_admin) should be filtered out in public queries.';

