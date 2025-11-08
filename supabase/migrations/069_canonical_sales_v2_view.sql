-- Canonical sales_v2 view definition
-- GENERATED - DO NOT EDIT ELSEWHERE
-- This is the single source of truth for the public.sales_v2 view
-- All environments should use this exact definition

-- Drop existing view
DROP VIEW IF EXISTS public.sales_v2 CASCADE;

-- Create canonical view with all required columns
CREATE VIEW public.sales_v2 AS
SELECT 
    id,
    created_at,
    updated_at,
    owner_id,                    -- Required for owner queries and RLS
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
    cover_image_url,             -- For dashboard thumbnails
    images                       -- For additional photos
FROM lootaura_v2.sales;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.sales_v2 IS 
    'Canonical view of sales table. Includes owner_id for owner queries and RLS. DO NOT EDIT ELSEWHERE.';

