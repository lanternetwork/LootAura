-- Create public view for favorites to allow anon/authenticated access via public schema
-- Mirrors lootaura_v2.favorites with safe columns

DROP VIEW IF EXISTS public.favorites_v2 CASCADE;

CREATE VIEW public.favorites_v2 AS
SELECT 
  user_id,
  sale_id,
  created_at
FROM lootaura_v2.favorites;

GRANT SELECT, INSERT, DELETE ON public.favorites_v2 TO anon, authenticated;

-- Note: writes still rely on RLS policies on lootaura_v2.favorites via rules.
-- PostgREST will target the view, which forwards to base table through rules.


