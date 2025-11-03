-- Create owner_stats table to track per-user sale counts and ratings
-- This table tracks seller activity metrics

create table if not exists lootaura_v2.owner_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_sales int not null default 0,
  last_sale_at timestamptz,
  avg_rating numeric(2,1) default 5.0,
  ratings_count int default 0,
  updated_at timestamptz not null default now()
);

-- bump count any time a sale is created
create or replace function lootaura_v2.bump_owner_sales_on_insert()
returns trigger
language plpgsql
as $$
begin
  insert into lootaura_v2.owner_stats (user_id, total_sales, last_sale_at)
  values (new.owner_id, 1, now())
  on conflict (user_id) do update
    set total_sales = lootaura_v2.owner_stats.total_sales + 1,
        last_sale_at = now(),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bump_owner_sales_on_insert on lootaura_v2.sales;

create trigger trg_bump_owner_sales_on_insert
after insert on lootaura_v2.sales
for each row
execute function lootaura_v2.bump_owner_sales_on_insert();

-- RLS policies for owner_stats
alter table lootaura_v2.owner_stats enable row level security;

-- allow authenticated users to read owner stats
create policy "owner_stats_read_all_auth"
on lootaura_v2.owner_stats
for select
to authenticated
using (true);

-- allow service role to read everything
create policy "owner_stats_read_all_service"
on lootaura_v2.owner_stats
for select
to service_role
using (true);

-- Create public view for owner_stats (similar to profiles_v2)
DROP VIEW IF EXISTS public.owner_stats CASCADE;

CREATE VIEW public.owner_stats AS
SELECT 
    user_id,
    total_sales,
    last_sale_at,
    avg_rating,
    ratings_count,
    updated_at
FROM lootaura_v2.owner_stats;

-- Grant permissions on view
GRANT SELECT ON public.owner_stats TO anon, authenticated;

-- TODO: future: handle deletes/archives - decrement total_sales when sale is deleted or archived

