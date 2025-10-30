-- Add cover_image_url column to sales table (if not present)
alter table if exists public.sales
  add column if not exists cover_image_url text;

-- Note: images text[] column is assumed to already exist per prior schema.
-- If it does not, uncomment the following line:
-- alter table if exists public.sales add column if not exists images text[];

-- Intentionally not replacing public.sales_v2 view here to avoid breaking downstream
-- consumers. API layers should select these columns directly when needed.
-- Add cover image support to sales and expose via public view
-- 1) Add columns to base table
ALTER TABLE IF EXISTS lootaura_v2.sales
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}'::text[];

-- 2) Recreate public view to project new columns
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
    -- Newly exposed media fields
    cover_image_url,
    images
FROM lootaura_v2.sales;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;


