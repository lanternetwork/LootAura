-- Create seller_ratings table for 1-5 star ratings
-- Each authenticated user can have at most one rating per seller
-- Ratings are attached to the seller, not individual sales

create table if not exists lootaura_v2.seller_ratings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  rater_id uuid not null references auth.users(id) on delete cascade,
  sale_id uuid references lootaura_v2.sales(id) on delete set null,
  rating int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Constraints
  constraint rating_range check (rating >= 1 and rating <= 5),
  constraint no_self_rating check (seller_id != rater_id),
  constraint unique_user_seller_rating unique (seller_id, rater_id)
);

-- Index for efficient seller stats aggregation
create index if not exists idx_seller_ratings_seller_id on lootaura_v2.seller_ratings(seller_id);

-- Index for efficient user rating lookup
create index if not exists idx_seller_ratings_rater_id on lootaura_v2.seller_ratings(rater_id);

-- Function to update updated_at timestamp
create or replace function lootaura_v2.update_seller_ratings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger to auto-update updated_at
drop trigger if exists trg_update_seller_ratings_updated_at on lootaura_v2.seller_ratings;

create trigger trg_update_seller_ratings_updated_at
before update on lootaura_v2.seller_ratings
for each row
execute function lootaura_v2.update_seller_ratings_updated_at();

-- Enable RLS
alter table lootaura_v2.seller_ratings enable row level security;

-- RLS Policies

-- SELECT: Allow anyone (including anon) to read ratings (they only contain numeric ratings and IDs)
create policy "seller_ratings_read_all"
on lootaura_v2.seller_ratings
for select
to anon, authenticated
using (true);

-- Allow service role to read everything
create policy "seller_ratings_read_service"
on lootaura_v2.seller_ratings
for select
to service_role
using (true);

-- INSERT: Allow authenticated users to insert their own ratings
-- Must be authenticated, rater_id must match auth.uid(), and seller_id must be different
create policy "seller_ratings_insert_own"
on lootaura_v2.seller_ratings
for insert
to authenticated
with check (
  rater_id = auth.uid() and
  seller_id != auth.uid()
);

-- UPDATE: Allow authenticated users to update their own ratings
create policy "seller_ratings_update_own"
on lootaura_v2.seller_ratings
for update
to authenticated
using (rater_id = auth.uid())
with check (rater_id = auth.uid());

-- DELETE: Allow users to delete their own ratings (for flexibility)
create policy "seller_ratings_delete_own"
on lootaura_v2.seller_ratings
for delete
to authenticated
using (rater_id = auth.uid());

-- Create public view for seller_ratings
drop view if exists public.seller_ratings cascade;

create view public.seller_ratings as
select 
  id,
  seller_id,
  rater_id,
  sale_id,
  rating,
  created_at,
  updated_at
from lootaura_v2.seller_ratings;

-- Grant permissions on view
grant select on public.seller_ratings to anon, authenticated;

