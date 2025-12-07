-- Fix profiles_v2 view permissions to ensure full access
-- This migration ensures the view has all necessary permissions for reading and writing

-- Grant full permissions on the view (consistent with other v2 views)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_v2 TO anon, authenticated;

