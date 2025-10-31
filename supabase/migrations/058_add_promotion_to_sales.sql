-- Add promotion columns to lootaura_v2.sales and update public view

ALTER TABLE IF EXISTS lootaura_v2.sales
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz,
  ADD COLUMN IF NOT EXISTS promotion_source text;

-- Recreate public view to include promotion columns
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
  images,
  is_promoted,
  promoted_until,
  promotion_source
FROM lootaura_v2.sales;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;


