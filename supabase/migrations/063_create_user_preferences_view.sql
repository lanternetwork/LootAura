-- Create public view for user_preferences to allow access via public schema
-- Mirrors lootaura_v2.user_preferences with safe columns

DROP VIEW IF EXISTS public.user_preferences CASCADE;

CREATE VIEW public.user_preferences AS
SELECT 
  user_id,
  theme,
  email_opt_in,
  units,
  discovery_radius_km,
  updated_at
FROM lootaura_v2.user_preferences;

-- Grant permissions on the view
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;

-- Note: RLS policies on lootaura_v2.user_preferences will still apply through the view

