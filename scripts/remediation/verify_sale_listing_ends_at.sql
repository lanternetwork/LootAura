-- Phase 1–3 verification + operational checks for sale listing window (ends_at, listing_timezone, archive).
-- Run in Supabase SQL editor or psql after migrations 170 (columns) and 171 (archive RPCs).
--
-- RUNBOOK (summary):
-- 1) Apply migrations 170, 171; deploy app with SQL archive + backfill CLI.
-- 2) Dry-run backfill: `npm run backfill:sale-listing-ends:dry` (requires env for Supabase URL + service role).
-- 3) Execute backfill in batches until published_missing_ends_at ~0 (or known residual for bad geo).
-- 4) Daily cron / admin archive trigger use RPC batches; watch logs `archive_sales_*` and `sale_listing_ends_backfill_*`.
-- 5) Rollback app deploy to prior version if needed; drop migration 171 functions only if reverting SQL archive
--    (rows partially archived stay archived — plan accordingly).

-- 1) Published sales missing ends_at (should trend down after backfill)
select count(*) as published_missing_ends_at
from lootaura_v2.sales
where status = 'published'
  and archived_at is null
  and ends_at is null;

-- 2) Published sales with ends_at but no listing_timezone
select count(*) as published_ends_without_tz
from lootaura_v2.sales
where status = 'published'
  and archived_at is null
  and ends_at is not null
  and (listing_timezone is null or btrim(listing_timezone) = '');

-- 3) Published / active: ends_at strictly before now() but not archived (stale — should be ~0 after cron)
select count(*) as stale_unarchived_past_ends_at
from lootaura_v2.sales
where status in ('published', 'active')
  and archived_at is null
  and ends_at is not null
  and ends_at < now();

-- 4) Suspicious ordering: listing end before computed start
select count(*) as suspicious_ends_before_starts
from lootaura_v2.sales
where archived_at is null
  and ends_at is not null
  and starts_at is not null
  and ends_at < starts_at;

-- 5) RPC snapshot (same semantics as app `count_sales_pending_archive`)
select lootaura_v2.count_sales_pending_archive(now()) as pending_archive_json;

-- 6) Sample stale rows (past ends_at, still live)
select id, title, status, date_start, date_end, time_end, listing_timezone, ends_at, updated_at
from lootaura_v2.sales
where status = 'published'
  and archived_at is null
  and ends_at is not null
  and ends_at < now()
order by ends_at asc
limit 25;

-- 7) Sample published rows still missing ends_at
select id, title, status, date_start, date_end, time_end, listing_timezone, ends_at, zip_code, lat, lng
from lootaura_v2.sales
where status = 'published'
  and archived_at is null
  and ends_at is null
order by updated_at desc
limit 25;

-- 8) Operational note: invalid IANA / unresolved wall-clock skips are logged server-side
--    (`sale_listing_window:*`, `sale_listing_ends_backfill:*`).
