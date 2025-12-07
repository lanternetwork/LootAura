-- Fix profiles_v2 view permissions - only grant SELECT (read-only)
-- The view is read-only; all writes go to lootaura_v2.profiles base table via RPC functions
-- This ensures security by preventing direct writes to the view

-- Grant only SELECT permission on the view (read-only access)
GRANT SELECT ON public.profiles_v2 TO anon, authenticated;

