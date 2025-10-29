-- Add cover_image_url and images fields to sales_v2 table
-- This migration adds image support for sales cards and primary image flow

-- Add cover_image_url column to lootaura_v2.sales table
ALTER TABLE lootaura_v2.sales 
ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- Update the public view to include the new columns
DROP VIEW IF EXISTS public.sales_v2 CASCADE;

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
    cover_image_url,
    images
FROM lootaura_v2.sales;

-- Grant permissions on the updated view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;

-- Add index for cover_image_url queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_sales_v2_cover_image_url ON lootaura_v2.sales(cover_image_url) WHERE cover_image_url IS NOT NULL;
