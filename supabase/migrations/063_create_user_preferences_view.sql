-- Create public view for user_preferences to allow access via public schema
-- Mirrors lootaura_v2.user_preferences with safe columns

-- First ensure the user_preferences table exists
CREATE TABLE IF NOT EXISTS lootaura_v2.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  email_opt_in boolean not null default false,
  units text not null default 'imperial' check (units in ('imperial','metric')),
  discovery_radius_km numeric not null default 10 check (discovery_radius_km >= 1 and discovery_radius_km <= 50),
  updated_at timestamptz not null default now()
);

-- RLS for user_preferences (if not already enabled)
ALTER TABLE lootaura_v2.user_preferences ENABLE ROW LEVEL SECURITY;

-- Policies for user_preferences (if not already exist)
DROP POLICY IF EXISTS user_prefs_select_self ON lootaura_v2.user_preferences;
CREATE POLICY user_prefs_select_self ON lootaura_v2.user_preferences FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_prefs_upsert_self ON lootaura_v2.user_preferences;
CREATE POLICY user_prefs_upsert_self ON lootaura_v2.user_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_prefs_update_self ON lootaura_v2.user_preferences;
CREATE POLICY user_prefs_update_self ON lootaura_v2.user_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Now create the public view
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

