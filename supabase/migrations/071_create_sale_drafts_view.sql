-- Create public view for sale_drafts table to allow writes through PostgREST
-- PostgREST only supports 'public' and 'graphql_public' schemas in client config
-- This view allows writes to lootaura_v2.sale_drafts through the public schema

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.sale_drafts CASCADE;

-- Create view that maps to lootaura_v2.sale_drafts
CREATE VIEW public.sale_drafts AS
SELECT 
    id,
    user_id,
    draft_key,
    title,
    payload,
    status,
    expires_at,
    created_at,
    updated_at
FROM lootaura_v2.sale_drafts;

-- Grant permissions for writes (INSERT, UPDATE, DELETE)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_drafts TO anon, authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.sale_drafts IS 
    'Public view of sale_drafts table in lootaura_v2 schema. Allows writes through PostgREST.';

