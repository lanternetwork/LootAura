-- Add pricing_mode field to sales table
-- This allows sellers to specify whether prices are negotiable, firm, best offer, etc.

ALTER TABLE IF EXISTS lootaura_v2.sales
ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'negotiable' CHECK (pricing_mode IN ('negotiable', 'firm', 'best_offer', 'ask'));

-- Update public view to include pricing_mode
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
    pricing_mode
FROM lootaura_v2.sales;

-- Grant permissions on view (already granted in previous migration, but ensuring consistency)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;

