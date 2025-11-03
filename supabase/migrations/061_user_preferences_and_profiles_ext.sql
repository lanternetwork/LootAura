-- Extend profiles table with optional fields if missing
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'bio'
  ) then
    alter table public.profiles add column bio text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'location_city'
  ) then
    alter table public.profiles add column location_city text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'location_region'
  ) then
    alter table public.profiles add column location_region text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'updated_at'
  ) then
    alter table public.profiles add column updated_at timestamptz default now();
  end if;
exception when others then null; -- tolerate if profiles is namespaced differently in another env
end $$;

-- Add user_preferences table if not exists
create table if not exists lootaura_v2.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  email_opt_in boolean not null default false,
  units text not null default 'imperial' check (units in ('imperial','metric')),
  discovery_radius_km numeric not null default 10 check (discovery_radius_km >= 1 and discovery_radius_km <= 50),
  updated_at timestamptz not null default now()
);

-- RLS for user_preferences
alter table lootaura_v2.user_preferences enable row level security;

drop policy if exists user_prefs_select_self on lootaura_v2.user_preferences;
create policy user_prefs_select_self on lootaura_v2.user_preferences for select to authenticated using (user_id = auth.uid());

drop policy if exists user_prefs_upsert_self on lootaura_v2.user_preferences;
create policy user_prefs_upsert_self on lootaura_v2.user_preferences for insert to authenticated with check (user_id = auth.uid());

drop policy if exists user_prefs_update_self on lootaura_v2.user_preferences;
create policy user_prefs_update_self on lootaura_v2.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());


