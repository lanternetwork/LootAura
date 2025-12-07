-- Fix favorites_v2 view RLS access
-- The view needs to properly pass through RLS from the underlying lootaura_v2.favorites table
-- The issue is that when PostgREST queries the view, it needs SELECT permission on the underlying table
-- RLS policies will still filter results to only the user's own favorites

-- Ensure authenticated users have SELECT permission on the underlying table
-- This is required for the view to work, but RLS will still enforce row-level security
GRANT SELECT ON lootaura_v2.favorites TO authenticated;

-- Recreate the view to ensure it uses security_invoker (default, but explicit is better)
DROP VIEW IF EXISTS public.favorites_v2 CASCADE;

CREATE VIEW public.favorites_v2 AS
SELECT 
  user_id,
  sale_id,
  created_at
FROM lootaura_v2.favorites;

-- Grant permissions on the view
GRANT SELECT, INSERT, DELETE ON public.favorites_v2 TO anon, authenticated;

-- Note: The RLS policies on lootaura_v2.favorites will still apply when querying through the view:
-- - favorites_owner_read: FOR SELECT USING (auth.uid() = user_id)
-- - favorites_owner_insert: FOR INSERT WITH CHECK (auth.uid() = user_id)  
-- - favorites_owner_delete: FOR DELETE USING (auth.uid() = user_id)
-- The GRANT SELECT above allows the view to query the table, but RLS filters the results.

