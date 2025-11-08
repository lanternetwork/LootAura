-- Add privacy_mode column to sales_v2 view
-- This column is required for sale creation but was missing from the view

-- First, ensure the column exists in the base table
ALTER TABLE IF EXISTS lootaura_v2.sales
ADD COLUMN IF NOT EXISTS privacy_mode TEXT DEFAULT 'exact' CHECK (privacy_mode IN ('exact', 'block_until_24h'));

-- Drop existing view
DROP VIEW IF EXISTS public.sales_v2 CASCADE;

-- Recreate view with privacy_mode column
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
    privacy_mode,                -- Required for sale creation
    cover_image_url,             -- For dashboard thumbnails
    images                       -- For additional photos
FROM lootaura_v2.sales;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.sales_v2 IS 
    'Canonical view of sales table. Includes owner_id for owner queries and RLS. DO NOT EDIT ELSEWHERE.';

