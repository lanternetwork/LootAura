-- Integrate seller_ratings into owner_stats
-- Update owner_stats.avg_rating and ratings_count when seller_ratings change

-- Function to recalculate and update owner_stats ratings
create or replace function lootaura_v2.update_owner_stats_ratings(p_seller_id uuid)
returns void
language plpgsql
security definer
set search_path = lootaura_v2, public
as $$
declare
  v_avg_rating numeric(2,1);
  v_ratings_count int;
begin
  -- Calculate average rating and count from seller_ratings
  select 
    coalesce(round(avg(rating)::numeric, 1), null),
    count(*)
  into v_avg_rating, v_ratings_count
  from lootaura_v2.seller_ratings
  where seller_id = p_seller_id;

  -- Update owner_stats (insert if doesn't exist, update if does)
  insert into lootaura_v2.owner_stats (user_id, avg_rating, ratings_count, updated_at)
  values (p_seller_id, v_avg_rating, v_ratings_count, now())
  on conflict (user_id) do update
    set avg_rating = excluded.avg_rating,
        ratings_count = excluded.ratings_count,
        updated_at = now();
end;
$$;

-- Trigger function for INSERT on seller_ratings
create or replace function lootaura_v2.bump_owner_stats_ratings_on_insert()
returns trigger
language plpgsql
security definer
set search_path = lootaura_v2, public
as $$
begin
  perform lootaura_v2.update_owner_stats_ratings(new.seller_id);
  return new;
end;
$$;

-- Trigger function for UPDATE on seller_ratings
create or replace function lootaura_v2.bump_owner_stats_ratings_on_update()
returns trigger
language plpgsql
security definer
set search_path = lootaura_v2, public
as $$
begin
  -- Update stats for both old and new seller_id (in case seller_id changes, though it shouldn't)
  if old.seller_id != new.seller_id then
    perform lootaura_v2.update_owner_stats_ratings(old.seller_id);
  end if;
  perform lootaura_v2.update_owner_stats_ratings(new.seller_id);
  return new;
end;
$$;

-- Trigger function for DELETE on seller_ratings
create or replace function lootaura_v2.bump_owner_stats_ratings_on_delete()
returns trigger
language plpgsql
security definer
set search_path = lootaura_v2, public
as $$
begin
  perform lootaura_v2.update_owner_stats_ratings(old.seller_id);
  return old;
end;
$$;

-- Create triggers
drop trigger if exists trg_bump_owner_stats_ratings_on_insert on lootaura_v2.seller_ratings;
drop trigger if exists trg_bump_owner_stats_ratings_on_update on lootaura_v2.seller_ratings;
drop trigger if exists trg_bump_owner_stats_ratings_on_delete on lootaura_v2.seller_ratings;

create trigger trg_bump_owner_stats_ratings_on_insert
after insert on lootaura_v2.seller_ratings
for each row
execute function lootaura_v2.bump_owner_stats_ratings_on_insert();

create trigger trg_bump_owner_stats_ratings_on_update
after update on lootaura_v2.seller_ratings
for each row
execute function lootaura_v2.bump_owner_stats_ratings_on_update();

create trigger trg_bump_owner_stats_ratings_on_delete
after delete on lootaura_v2.seller_ratings
for each row
execute function lootaura_v2.bump_owner_stats_ratings_on_delete();

-- Backfill existing ratings (if any) - this is safe to run even if there are no ratings yet
-- Update all owner_stats rows to have correct ratings from seller_ratings
do $$
declare
  seller_record record;
begin
  for seller_record in select distinct seller_id from lootaura_v2.seller_ratings
  loop
    perform lootaura_v2.update_owner_stats_ratings(seller_record.seller_id);
  end loop;
end;
$$;

