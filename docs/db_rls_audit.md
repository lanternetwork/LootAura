## 1. Overview

LootAura uses a **two-layer access pattern** for database data:

- **Base tables in `lootaura_v2`** hold the canonical data and are protected by **Row Level Security (RLS)**.
- **Public / app-facing views in `public`** (`*_v2` views, analytics views, etc.) expose curated subsets of that data for:
  - Anonymous/public access (e.g. browsing published sales),
  - Authenticated app flows (e.g. profile viewing, favorites, metrics),
  while still being subject to RLS on the underlying tables.

High-level rules:

- **Sales & items**: public can read *published* sales and their items; only the owner (`owner_id = auth.uid()`) can create/update/delete their own sales and items.
- **Profiles & preferences**: profiles and user preferences are tied to `auth.users(id)`; owners can manage their own rows; public reads are done via views with limited columns (`profiles_v2`, `user_preferences`).
- **Favorites & drafts**: only the owner can see or modify their own favorites and sale drafts.
- **Analytics/events**: raw analytics are not public; owners can see their own events; service role can write for tracking.
- **Legacy `public` tables** (`yard_sales`, `sale_items`, `favorites`, `profiles`) are kept for backwards-compatibility and health/debug endpoints, but the main app uses `lootaura_v2` + public views.

This document summarizes the current RLS configuration and related views based on the versioned SQL under `supabase/migrations`.

---

## 2. Tables & RLS Policies (lootaura_v2)

### 2.1 `lootaura_v2.profiles`

- **Creation**: `033_safe_lootaura_v2_schema.sql`
- **RLS**:
  - Enabled: yes  
    - `ALTER TABLE lootaura_v2.profiles ENABLE ROW LEVEL SECURITY;`
  - Policies (latest from `047_rls_hardening.sql`):
    - `profiles_public_read` – `FOR SELECT USING (true)`
      - **Who can SELECT**: any role that has table/view privileges (anon + authenticated, typically via views).
      - **Predicate**: no per-row restriction at table level; public read is constrained primarily via what columns are exposed through `public.profiles_v2`.
    - `profiles_owner_insert` – `FOR INSERT WITH CHECK (auth.uid() = id)`
      - Only the authenticated user can insert a profile row where `id = auth.uid()`.
    - `profiles_owner_update` – `FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`
      - Only the owner can update their own profile row.
- **Key predicates / columns**:
  - Owner predicate: `id = auth.uid()`.
- **Indexes supporting RLS**:
  - `idx_profiles_id` (`047_rls_hardening.sql`) on `(id)` for fast owner lookups.

### 2.2 `lootaura_v2.sales`

- **Creation**: `033_safe_lootaura_v2_schema.sql`
- **RLS**:
  - Enabled: yes  
    - `ALTER TABLE lootaura_v2.sales ENABLE ROW LEVEL SECURITY;`
  - Policies:
    - From `047_rls_hardening.sql`:
      - `sales_public_read` – `FOR SELECT USING (status = 'published')`
        - Public (anon + authenticated via `public.sales_v2`) can read rows where `status = 'published'`.
      - `sales_owner_insert` – `FOR INSERT WITH CHECK (auth.uid() = owner_id)`
        - Only the authenticated owner can create their own sales.
      - `sales_owner_update` – `FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id)`
        - Only the owner can update their own sales.
      - `sales_owner_delete` – `FOR DELETE USING (auth.uid() = owner_id)`
        - Only the owner can delete their own sales.
- **Key predicates / columns**:
  - Public read: `status = 'published'`.
  - Owner writes: `owner_id = auth.uid()`.
- **Indexes supporting RLS & access patterns**:
  - Base (`033_safe_lootaura_v2_schema.sql`): `sales_owner_id_idx`, `sales_status_idx`, `sales_lat_lng_idx`, `sales_geom_gist_idx`, `sales_starts_at_idx`.
  - RLS-specific (`047_rls_hardening.sql`): `idx_sales_owner_id_status` on `(owner_id, status)` where `status = 'published'`.
  - Additional perf indexes in `032_create_lootaura_v2_schema.sql`, `046_performance_optimization_indexes.sql`, `048_rls_performance_indexes.sql`, `088_sales_query_performance_indexes.sql` for search, map, and dashboard flows.

### 2.3 `lootaura_v2.items`

- **Creation**: `033_safe_lootaura_v2_schema.sql`
- **RLS**:
  - Enabled: yes
  - Policies (`047_rls_hardening.sql`):
    - `items_public_read` – `FOR SELECT USING (EXISTS (SELECT 1 FROM lootaura_v2.sales WHERE id = sale_id AND status = 'published'))`
      - Public can read items belonging to published sales only.
    - `items_owner_insert` – `FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM lootaura_v2.sales WHERE id = sale_id AND owner_id = auth.uid()))`
      - Only the owner of the sale can insert items for that sale.
    - `items_owner_update` – `FOR UPDATE USING (EXISTS (... owner_id = auth.uid())) WITH CHECK (EXISTS (... owner_id = auth.uid()))`
      - Only the owner of the sale can update items for that sale.
    - `items_owner_delete` – `FOR DELETE USING (EXISTS (... owner_id = auth.uid()))`
      - Only the owner can delete items for their sales.
- **Key predicates / columns**:
  - Join on `sale_id` to `lootaura_v2.sales(id)`, with `status` and `owner_id` predicates.
- **Indexes supporting RLS**:
  - Base: `items_sale_id_idx` (`033_safe_lootaura_v2_schema.sql`) on `(sale_id)`.
  - RLS: `idx_items_sale_id` (`047_rls_hardening.sql`), `idx_items_rls_sale_id`, `idx_items_sales_join` (`048_rls_performance_indexes.sql`).

### 2.4 `lootaura_v2.favorites`

- **Creation**: `033_safe_lootaura_v2_schema.sql`
- **RLS**:
  - Enabled: yes
  - Policies (`047_rls_hardening.sql`):
    - `favorites_owner_read` – `FOR SELECT USING (auth.uid() = user_id)`
      - Only the owner can read their own favorites.
    - `favorites_owner_insert` – `FOR INSERT WITH CHECK (auth.uid() = user_id)`
      - Only the owner can insert their favorites.
    - `favorites_owner_delete` – `FOR DELETE USING (auth.uid() = user_id)`
      - Only the owner can delete their favorites.
- **Key predicates / columns**:
  - Owner predicate: `user_id = auth.uid()`.
- **Indexes supporting RLS**:
  - Base: `favorites_user_id_idx`, `favorites_sale_id_idx` (`033_safe_lootaura_v2_schema.sql`).
  - RLS/perf: `idx_favorites_user_id`, `idx_favorites_rls_user_id`, `idx_favorites_rls_sale_id` (`047_rls_hardening.sql`, `048_rls_performance_indexes.sql`).

### 2.5 `lootaura_v2.reviews`

- **Creation**: `033_safe_lootaura_v2_schema.sql`, refined in `036_dual_link_reviews_system.sql`, `038_ensure_reviews_table.sql`, `039_final_reviews_setup.sql`.
- **RLS**:
  - Enabled: yes
  - Policies (from `033_safe_lootaura_v2_schema.sql` and `036_dual_link_reviews_system.sql` family):
    - Public read: `Reviews are viewable by everyone` – `FOR SELECT USING (true)`.
      - Allows public read of reviews (typically through `public.reviews_v2`).
    - Owner manage policies:
      - Insert/update/delete restricted to `auth.uid() = user_id`.
- **Key predicates / columns**:
  - Owner predicate: `user_id = auth.uid()`.
  - Join keys: `sale_id`, `seller_id`, `address_key`, `review_key`.
- **Indexes**:
  - `reviews_sale_id_idx`, `reviews_user_id_idx`, `reviews_address_seller_idx`, plus `reviews_review_key_idx`, `reviews_address_key_idx`, `reviews_seller_id_idx` across multiple migrations.

### 2.6 `lootaura_v2.zipcodes`

- **Creation**: `033_safe_lootaura_v2_schema.sql` / `013_create_zipcodes_table.sql`.
- **RLS**:
  - Enabled: yes
  - Policies:
    - `Zipcodes are viewable by everyone` / `zipcodes read` – `FOR SELECT USING (true)`
      - Read-only public access; no insert/update/delete RLS policies (table is effectively static reference data).
- **Key predicates / columns**:
  - `zip_code` (PK), `city`, `state`, `lat`, `lng`, `geom`.
- **Indexes**:
  - Spatial and search: `zipcodes_geom_gist_idx`, `zipcodes_zip_code_idx`, `zipcodes_state_idx`, `zipcodes_city_idx`, `zipcodes_lat_lng_idx`.

### 2.7 `lootaura_v2.sale_drafts`

- **Creation**: `067_create_sale_drafts.sql`
- **RLS**:
  - Enabled: yes
  - Policies:
    - `select own drafts` – `FOR SELECT USING (auth.uid() = user_id)`
    - `insert own drafts` – `FOR INSERT WITH CHECK (auth.uid() = user_id)`
    - `update own drafts` – `FOR UPDATE USING (auth.uid() = user_id)`
    - `delete own drafts` – `FOR DELETE USING (auth.uid() = user_id)`
  - **Owner-only**: drafts are only visible/mutable to their owner.
- **Key predicates / columns**:
  - `user_id = auth.uid()`
  - Status-based cleanup via `status` and `expires_at`.
- **Indexes**:
  - `sale_drafts_user_key` (unique on `(user_id, draft_key)` for active drafts),
  - `sale_drafts_user_status_updated`,
  - `sale_drafts_expires_at`,
  - `sale_drafts_status`.

### 2.8 `lootaura_v2.analytics_events`

- **Creation**: `081_create_analytics_events.sql`
- **RLS**:
  - Enabled: yes
  - Policies:
    - `ae_owner_select` – `FOR SELECT USING (owner_id = auth.uid())`
      - Owners can read analytics events for their own sales.
  - Writes:
    - Service role (`service_role`) has full `SELECT, INSERT, UPDATE, DELETE` on the table (used for tracking/aggregation), bypassing RLS as appropriate.
- **Key predicates / columns**:
  - Owner predicate: `owner_id = auth.uid()`.
- **Indexes**:
  - `idx_ae_sale_ts` `(sale_id, ts DESC)`,
  - `idx_ae_owner_ts` `(owner_id, ts DESC)`,
  - `idx_ae_type_ts` `(event_type, ts DESC)`,
  - `idx_ae_is_test` `(is_test)`.

### 2.9 `lootaura_v2.user_preferences`

- **Creation**: `063_create_user_preferences_view.sql`
- **RLS**:
  - Enabled: yes
  - Policies:
    - `user_prefs_select_self` – `FOR SELECT TO authenticated USING (user_id = auth.uid())`
    - `user_prefs_upsert_self` – `FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())`
    - `user_prefs_update_self` – `FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
  - Anonymous users do not access this table directly; access is via authenticated view usage.
- **Key predicates / columns**:
  - `user_id = auth.uid()`.
- **Indexes**:
  - None explicit beyond PK; queries are always by `user_id` (PK).

### 2.10 Other related tables

Some additional tables are present but not core to `lootaura_v2` user data:

- `user_presets` – user-specific settings with RLS enforced (`050_user_presets.sql`), allowing users to manage their own presets.
- `shared_states` – ephemeral/shared state table with RLS enabled (`051_shared_states.sql`) and relevant indexes.

---

## 3. Public Views and Their Base Tables

These views live in the `public` schema and are the primary read surfaces for the app:

- **`public.sales_v2`**  
  - Defined and refined across: `034_public_v2_wrappers.sql`, `036_dual_link_reviews_system.sql`, `037_simple_dual_link_reviews.sql`, `039_final_reviews_setup.sql`, `047_rls_hardening.sql`, `052_add_cover_image_url_to_sales.sql`, `055_add_pricing_mode_to_sales.sql`, `069_canonical_sales_v2_view.sql`, `072_add_privacy_mode_to_sales_v2_view.sql`.  
  - **Base table**: `lootaura_v2.sales`.  
  - **Intended access**: public browsing of published/active sales (used widely in `lib/data/salesAccess.ts`, `lib/data/sales.ts`, many API routes).  
  - RLS enforcement: relies on `sales_public_read` policy on `lootaura_v2.sales` (`status = 'published'`).

- **`public.items_v2`**  
  - Created/updated in: `034_public_v2_wrappers.sql`, `035_fix_items_v2_category*.sql`, `083_add_image_url_to_items_v2_view.sql`.  
  - **Base table**: `lootaura_v2.items`.  
  - **Intended access**: items for published sales only, used by detail views and internal processes.  
  - RLS enforcement: `items_public_read` policy ensures only items for published sales are visible.

- **`public.favorites_v2`**  
  - Defined in: `034_public_v2_wrappers.sql`, `056_create_public_favorites_view.sql`.  
  - **Base table**: `lootaura_v2.favorites`.  
  - **Intended access**: authenticated users’ favorites list (used via `favorites_v2` in API and hooks).  
  - RLS enforcement: `favorites_owner_read` ensures each user sees only their own favorites.

- **`public.profiles_v2`**  
  - Defined in: `034_public_v2_wrappers.sql`, `062_update_profiles_v2_view.sql`, `084_add_social_links_to_profiles.sql`.  
  - **Base table**: `lootaura_v2.profiles`.  
  - **Intended access**: public profile info (display_name, avatar_url, bio, location city/region, verified), used by profile pages and public listings.  
  - RLS enforcement: `profiles_public_read` allows table-level read; the view constrains which columns are exposed.

- **`public.zipcodes_v2`**  
  - Defined in: `034_public_v2_wrappers.sql`.  
  - **Base table**: `lootaura_v2.zipcodes`.  
  - **Intended access**: read-only geocoding data (used for search and map operations).

- **`public.reviews_v2`**  
  - Defined in: `036_dual_link_reviews_system.sql`, `037_simple_dual_link_reviews.sql`, `038_ensure_reviews_table.sql`, `039_final_reviews_setup.sql`.  
  - **Base table**: `lootaura_v2.reviews`.  
  - **Intended access**: public/seller reviews for listings and seller stats.

- **`public.user_preferences`**  
  - Defined in: `063_create_user_preferences_view.sql`.  
  - **Base table**: `lootaura_v2.user_preferences`.  
  - **Intended access**: authenticated user settings (theme, units, radius, email_opt_in), exposed via app APIs.

- **`public.owner_stats`**  
  - Defined in: `054_create_owner_stats_table.sql`.  
  - **Base sources**: analytics and sales tables; used to expose aggregated metrics to sellers/owners.

- **`public.analytics_events_v2`**  
  - Defined in: `082_create_analytics_views.sql`.  
  - **Base table**: `lootaura_v2.analytics_events`.  
  - **Intended access**: owner-only analytics views and admin dashboards (not public).

---

## 4. Legacy / Deprecated Tables

These tables exist primarily for backwards compatibility or health/debug purposes and are not part of the `lootaura_v2` design.

### 4.1 Legacy public v1 tables

Defined in `001_initial_schema.sql`:

- `public.yard_sales`
- `public.sale_items` (now renamed to `public.sale_items_legacy` by `090_legacy_sale_items_rename.sql`)
- `public.favorites`
- `public.profiles`

RLS is enabled on these, with simple owner/public-read policies:

- `yard_sales`:
  - Public read: `"Public read sales"` – `FOR SELECT USING (true)`.
  - Owner manage: `"Owners manage sales"` – `FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id)`.
- `sale_items` / `sale_items_legacy`:
  - Public read: `"Public read items"` – `FOR SELECT USING (true)`.
  - Owner manage via join to `yard_sales` on `sale_id`.
- `favorites`:
  - `"Users manage favorites"` – `FOR ALL USING (auth.uid() = user_id)`.
- `profiles`:
  - `"Users manage profile"` – `FOR ALL USING (auth.uid() = id)`.

**Current usage in the repo**:

- `yard_sales`:
  - Used in health endpoints and tests:
    - `app/api/health/search/route.ts` (diagnostic endpoint, not main app flow).
    - `app/api/health/postgis/route.ts` (PostGIS health check).
    - Various tests (`tests/integration/rls.owner.test.ts`, `tests/e2e/add-sale.spec.ts`, `tests/utils/mocks.ts`).
  - Also referenced in older migrations as a source for search functions.
- `favorites` (public schema):
  - Still used in `lib/data/sales.ts` for the `toggleFavorite` implementation (direct reads/writes to `public.favorites`) in addition to the newer `favorites_v2` view on `lootaura_v2.favorites`.
  - Because it is part of live application flows, it must not be renamed or dropped at this time.
- `profiles` (public schema):
  - Still used in various APIs and hooks (`app/api/profile/route.ts`, `lib/hooks/useAuth.ts`, `app/api/preferences/route.ts`, `app/api/public/profile/route.ts`, `app/(public)/u/[username]/page.tsx`, `app/api/health/supabase/route.ts`, `scripts/verify-supabase-keys.js`) for backwards-compatible profile access.
  - Must remain in place until all code paths are migrated to `lootaura_v2.profiles` + `profiles_v2`.
- `sale_items`:
  - Only referenced in legacy migrations (`001_initial_schema.sql`, `002_performance_indexes.sql`) and not in application runtime code.
  - As of this audit, no non-migration references exist in the repo. It has been conservatively renamed to `public.sale_items_legacy` by `090_legacy_sale_items_rename.sql` and marked as deprecated.

**Deprecation notes**:

- The main app code for **new data** is centered on `lootaura_v2` + `*_v2` views.
- `yard_sales`, `favorites`, and `profiles` in the public schema are still used by health/debug/test endpoints and some runtime flows and therefore are **not** renamed or dropped in this PR.
- `sale_items` has **no** runtime references in this repo as of this audit and has been renamed to `sale_items_legacy` to make its deprecated status explicit while keeping historical data intact.

---

## 5. Indexes Used by RLS

Several indexes exist specifically to support RLS predicates and high-frequency access patterns:

- **Profiles**:
  - `idx_profiles_id` on `lootaura_v2.profiles(id)` (`047_rls_hardening.sql`)  
    - Supports `auth.uid() = id` in `profiles_owner_update`.

- **Sales**:
  - `idx_sales_owner_id_status` on `(owner_id, status)` (`047_rls_hardening.sql`)  
    - Supports `status = 'published'` + owner filters.
  - RLS/perf indexes (`048_rls_performance_indexes.sql`, `046_performance_optimization_indexes.sql`, `088_sales_query_performance_indexes.sql`):
    - `(owner_id, status, updated_at)`, `(status, date_start)`, various spatial and text search indexes for `sales_v2` queries.

- **Items**:
  - `idx_items_sale_id` and `idx_items_rls_sale_id` on `(sale_id)` (`047_rls_hardening.sql`, `048_rls_performance_indexes.sql`)  
    - Support EXISTS subqueries joining items to sales by `sale_id`.

- **Favorites**:
  - `idx_favorites_user_id`, `idx_favorites_rls_user_id`, `idx_favorites_rls_sale_id` on `user_id`/`sale_id` (`047_rls_hardening.sql`, `048_rls_performance_indexes.sql`)  
    - Support `auth.uid() = user_id` and joins back to sales.

- **Sale drafts**:
  - `sale_drafts_user_status_updated` on `(user_id, status, updated_at DESC)` and `sale_drafts_user_key` on `(user_id, draft_key)` (`067_create_sale_drafts.sql`)  
    - Support owner-specific draft lookups and idempotent upserts.

- **Analytics events**:
  - `idx_ae_owner_ts` on `(owner_id, ts DESC)` (`081_create_analytics_events.sql`)  
    - Supports owner-based analytics views (`owner_id = auth.uid()`).

These indexes are intentionally aligned with RLS `USING`/`WITH CHECK` expressions or high-frequency WHERE clauses and should be preserved unless query analysis indicates redundancy.

---

## 6. Index Hygiene

During this audit, no **exact duplicate** indexes (different names, identical column sets and predicates) were identified in the versioned migrations.  
Many indexes intentionally overlap in purpose to support different query shapes (`sales_v2` searches, owner dashboards, RLS lookups), but they are not literal duplicates in schema.

As a result, this PR does **not** drop any indexes; future cleanup should be guided by live `pg_stat_user_indexes` statistics rather than static migration inspection.

---

## 7. Recommendations / TODOs

This section captures follow-up tasks; they are **not** implemented automatically by this audit.

1. **Legacy table cleanup (future)**  
   - Once health endpoints and tests no longer rely on `public.yard_sales`, evaluate renaming:
     - `public.sale_items` → `public.sale_items_legacy`
     - `public.favorites` → `public.favorites_legacy`
     - `public.profiles` → `public.profiles_legacy`
   - Update tests and any remaining code references accordingly before renaming.

2. **Profile visibility review**  
   - `profiles_public_read` currently allows table-level read of all profiles (with column limits enforced by `profiles_v2`).  
   - If stricter privacy is desired, consider tightening the SELECT policy and relying solely on `profiles_v2` for public/profile browsing while ensuring seller info remains available where needed.

3. **Index hygiene (non-breaking)**  
   - Some indexes on `lootaura_v2.sales`, `items`, and `favorites` overlap in purpose (e.g., multiple owner/status/date combinations).  
   - Use `pg_stat_user_indexes` in the Supabase project to identify very low-use or redundant indexes and consolidate where safe, keeping:
     - One `(owner_id, status)` index.
     - One or two key `(status, date*)` indexes.
     - Spatial and text search indexes that match actual query patterns.

4. **Analytics retention policy**  
   - Implement a retention or archiving policy for `lootaura_v2.analytics_events` (e.g., keep 6–12 months of data) to keep indexes small and queries fast.

5. **Document admin-only and service-role usage**  
   - Ensure that any admin APIs or background jobs using the `service_role` client are explicitly documented (and limited) so RLS assumptions remain clear and safe over time.


