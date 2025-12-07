-- Add archived_at column to sales table for tracking when sales were auto-archived
-- This enables 1-year retention queries for the seller archive tab

ALTER TABLE IF EXISTS lootaura_v2.sales
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- Add index for efficient queries on archived sales with date filtering
CREATE INDEX IF NOT EXISTS idx_sales_archived_at ON lootaura_v2.sales(archived_at) 
WHERE archived_at IS NOT NULL;

-- Add index for efficient queries filtering by status and end_date (for auto-archive job)
CREATE INDEX IF NOT EXISTS idx_sales_status_end_date ON lootaura_v2.sales(status, date_end) 
WHERE status IN ('published', 'active');

-- Update sales_v2 view to include archived_at
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
    pricing_mode,
    cover_url,
    tags,
    archived_at
FROM lootaura_v2.sales;

-- Grant permissions on view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;

