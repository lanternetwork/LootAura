-- Create public view for seller_settings table to allow reads through PostgREST
-- PostgREST only supports 'public' and 'graphql_public' schemas in client config
-- This view allows reads to lootaura_v2.seller_settings through the public schema

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.seller_settings CASCADE;

-- Create view that maps to lootaura_v2.seller_settings
CREATE VIEW public.seller_settings AS
SELECT 
    id,
    user_id,
    email_opt_in,
    default_radius_km,
    created_at,
    updated_at
FROM lootaura_v2.seller_settings;

-- Grant permissions for reads (SELECT only - writes go through API with write client)
GRANT SELECT ON public.seller_settings TO anon, authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.seller_settings IS 
    'Public view of seller_settings table in lootaura_v2 schema. Allows reads through PostgREST.';

