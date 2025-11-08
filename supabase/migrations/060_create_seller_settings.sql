-- Create seller_settings table (payments-agnostic)
create table if not exists lootaura_v2.seller_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  email_opt_in boolean not null default false,
  default_radius_km numeric not null default 10 check (default_radius_km >= 1 and default_radius_km <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger to keep updated_at fresh
create or replace function lootaura_v2.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_seller_settings_updated_at on lootaura_v2.seller_settings;
create trigger trg_seller_settings_updated_at
before update on lootaura_v2.seller_settings
for each row execute function lootaura_v2.set_updated_at();

-- RLS
alter table lootaura_v2.seller_settings enable row level security;

-- No access for anon by default (implicit)

-- Authenticated users can CRUD their own row
drop policy if exists seller_settings_select_self on lootaura_v2.seller_settings;
create policy seller_settings_select_self
on lootaura_v2.seller_settings for select
to authenticated using (user_id = auth.uid());

drop policy if exists seller_settings_insert_self on lootaura_v2.seller_settings;
create policy seller_settings_insert_self
on lootaura_v2.seller_settings for insert
to authenticated with check (user_id = auth.uid());

drop policy if exists seller_settings_update_self on lootaura_v2.seller_settings;
create policy seller_settings_update_self
on lootaura_v2.seller_settings for update
to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists seller_settings_delete_self on lootaura_v2.seller_settings;
create policy seller_settings_delete_self
on lootaura_v2.seller_settings for delete
to authenticated using (user_id = auth.uid());


