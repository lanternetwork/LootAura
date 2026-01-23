# Supabase Security & RLS Audit Report (LootAura)

**Generated:** 2025-01-XX  
**Scope:** Complete database schema, RLS policies, PostgREST exposure, function security, map data model, cron/email systems, and production hardening surfaces.

---

## 1. Schema Inventory

### 1.1 Tables by Schema

#### `lootaura_v2` Schema (Primary Data Layer)

**Core User Data:**
- `lootaura_v2.profiles` - User profiles (id, username, full_name, avatar_url, home_zip, preferences, created_at, updated_at)
- `lootaura_v2.sales` - Yard sale listings (id, owner_id, title, description, address, city, state, zip_code, lat, lng, geom, date_start, time_start, date_end, time_end, starts_at, status, is_featured, tags, cover_image_url, pricing_mode, privacy_mode)
- `lootaura_v2.items` - Items for sale (id, sale_id, name, description, price, category, condition, images, is_sold, updated_at, image_url)
- `lootaura_v2.favorites` - User favorites (user_id, sale_id, created_at, start_soon_notified_at)
- `lootaura_v2.reviews` - Seller reviews (id, sale_id, user_id, seller_id, address, rating, comment, address_key, review_key)
- `lootaura_v2.zipcodes` - ZIP code reference data (zip_code, city, state, lat, lng, geom, created_at, updated_at)

**User Settings & Preferences:**
- `lootaura_v2.user_preferences` - User preferences (user_id, theme, email_opt_in, units, discovery_radius_km, updated_at)
- `lootaura_v2.seller_settings` - Seller-specific settings (id, user_id, email_opt_in, default_radius_km, created_at, updated_at)
- `lootaura_v2.sale_drafts` - Draft sale persistence (id, user_id, draft_key, title, payload, status, created_at, updated_at, expires_at)

**Analytics & Stats:**
- `lootaura_v2.analytics_events` - Event tracking (id, sale_id, owner_id, user_id, event_type, ts, referrer, user_agent, is_test)
- `lootaura_v2.owner_stats` - Aggregated seller stats (user_id, total_sales, last_sale_at, avg_rating, ratings_count, updated_at)
- `lootaura_v2.seller_ratings` - Seller ratings (id, seller_id, rater_id, sale_id, rating, created_at, updated_at)

**Legacy/Deprecated:**
- `lootaura_v2.user_presets` - User presets (from `050_user_presets.sql`)
- `lootaura_v2.shared_states` - Ephemeral shared state (from `051_shared_states.sql`)

#### `public` Schema (App-Facing Views & Internal Tables)

**App-Facing Views (SECURITY INVOKER):**
- `public.sales_v2` → `lootaura_v2.sales`
- `public.items_v2` → `lootaura_v2.items`
- `public.favorites_v2` → `lootaura_v2.favorites`
- `public.profiles_v2` → `lootaura_v2.profiles`
- `public.zipcodes_v2` → `lootaura_v2.zipcodes`
- `public.reviews_v2` → `lootaura_v2.reviews`
- `public.user_preferences` → `lootaura_v2.user_preferences`
- `public.seller_settings` → `lootaura_v2.seller_settings`
- `public.owner_stats` → `lootaura_v2.owner_stats`
- `public.analytics_events_v2` → `lootaura_v2.analytics_events`
- `public.seller_ratings` → `lootaura_v2.seller_ratings`
- `public.sale_drafts` → `lootaura_v2.sale_drafts`

**Internal-Only Tables (RLS Enabled, Service-Role Only):**
- `public.ingest_runs` - Ingestion job metadata (internal-only, service-role access)
- `public.geocode_cache` - Geocoding cache (internal-only, service-role access)
- `public.spatial_ref_sys` - PostGIS system table (RLS enabled, service-role only; ownership may prevent policy creation)

**Legacy Tables (Backwards Compatibility):**
- `public.yard_sales` - Legacy sales table (still used by health endpoints)
- `public.sale_items_legacy` - Legacy items (renamed from `sale_items`, deprecated)
- `public.favorites` - Legacy favorites (still used in some runtime flows)
- `public.profiles` - Legacy profiles (still used in some runtime flows)

### 1.2 Views

All views in `public` schema are **SECURITY INVOKER** (configured in `093_supabase_security_lints_fix.sql`):

- **12 app-facing views** mapping to `lootaura_v2` base tables
- All views rely on RLS policies on underlying base tables
- Views expose curated column subsets (e.g., `sales_v2` excludes sensitive fields in some migrations)

### 1.3 Functions

#### Public Functions (RPC-Exposed)

**Search Functions (SECURITY INVOKER):**
- `public.search_sales_within_distance_v2(p_lat, p_lng, p_distance_km, p_start_date, p_end_date, p_categories, p_query, p_limit, p_offset)` - PostGIS distance search
- `public.search_sales_bbox_v2(p_lat, p_lng, p_distance_km, p_start_date, p_end_date, p_categories, p_query, p_limit, p_offset)` - Bounding box fallback search
- `public.search_sales(...)` - Legacy search function

**Profile Management (SECURITY DEFINER):**
- `public.update_profile(p_user_id, p_avatar_url, p_display_name, p_full_name, p_bio, p_location_city, p_location_region, p_social_links)` - Profile update RPC
- `public.get_profile(p_user_id)` - Profile read RPC

**Data Management:**
- `public.upsert_zipcodes(zipcodes_json)` - ZIP code bulk upsert (SECURITY DEFINER)

**Trigger Functions (SECURITY INVOKER unless noted):**
- `public.items_v2_insert`, `public.items_v2_update`, `public.items_v2_delete` - View trigger functions
- `public.get_user_review`, `public.get_sale_rating`, `public.get_address_seller_reviews` - Review helper functions
- `public.update_sale_search_tsv` - Full-text search trigger
- `public.update_updated_at_column` - Generic updated_at trigger

#### `lootaura_v2` Schema Functions

**Trigger Functions:**
- `lootaura_v2.set_geom_from_coords()` - Sets geometry from lat/lng (triggered on sales/zipcodes)
- `lootaura_v2.update_sale_drafts_updated_at()` - Draft timestamp trigger
- `lootaura_v2.cleanup_sale_drafts()` - Draft cleanup (SECURITY DEFINER)
- `lootaura_v2.set_updated_at()` - Generic updated_at trigger
- `lootaura_v2.update_seller_ratings_updated_at()` - Ratings timestamp trigger
- `lootaura_v2.bump_owner_sales_on_insert()` - Owner stats increment trigger
- `lootaura_v2.bump_owner_stats_ratings_on_insert/update/delete()` - Rating stats triggers (SECURITY DEFINER)

**Utility Functions:**
- `lootaura_v2.normalize_address(...)` - Address normalization
- `lootaura_v2.sync_sales_geom()` - Geometry sync
- `lootaura_v2.compute_review_key(...)` - Review key computation
- `lootaura_v2.update_owner_stats_ratings(p_seller_id)` - Rating aggregation (SECURITY DEFINER)

**Search Functions (Legacy):**
- `lootaura_v2.get_sales_within_distance(...)` - PostGIS distance search
- `lootaura_v2.search_sales_within_distance(...)` - PostGIS search with filters

**Function Security Summary:**
- **SECURITY INVOKER**: All search functions, most trigger functions, view triggers
- **SECURITY DEFINER**: Profile RPCs (`update_profile`, `get_profile`), ZIP upsert, cleanup functions, rating aggregation triggers
- **Search Path**: All functions now have fixed `search_path` set to `pg_catalog, public, lootaura_v2` (via `094_function_search_path_hardening.sql`)

### 1.4 Triggers

**Sales Table:**
- `sales_set_geom_trigger` → `lootaura_v2.set_geom_from_coords()` (BEFORE INSERT/UPDATE)
- `trg_bump_owner_sales_on_insert` → `lootaura_v2.bump_owner_sales_on_insert()` (AFTER INSERT)

**Zipcodes Table:**
- `zipcodes_set_geom_trigger` → `lootaura_v2.set_geom_from_coords()` (BEFORE INSERT/UPDATE)

**Items Table:**
- View triggers for `items_v2` INSERT/UPDATE/DELETE operations

**Seller Settings:**
- `trg_seller_settings_updated_at` → `lootaura_v2.set_updated_at()` (BEFORE UPDATE)

**Sale Drafts:**
- `sale_drafts_updated_at` → `lootaura_v2.update_sale_drafts_updated_at()` (BEFORE UPDATE)

**Seller Ratings:**
- `trg_update_seller_ratings_updated_at` → `lootaura_v2.update_seller_ratings_updated_at()` (BEFORE UPDATE)
- `trg_bump_owner_stats_ratings_on_insert/update/delete` → Rating aggregation triggers (AFTER INSERT/UPDATE/DELETE)

**Reviews:**
- Full-text search triggers for `update_sale_search_tsv`

---

## 2. RLS Policies

### 2.1 `lootaura_v2.profiles`

**RLS Enabled:** Yes  
**Policies:**
- `profiles_public_read` - `FOR SELECT USING (true)` - Public read (column filtering via view)
- `profiles_owner_insert` - `FOR INSERT WITH CHECK (auth.uid() = id)` - Owner-only insert
- `profiles_owner_update` - `FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)` - Owner-only update

**Indexes:** `idx_profiles_id` on `(id)`

### 2.2 `lootaura_v2.sales`

**RLS Enabled:** Yes  
**Policies:**
- `sales_public_read` - `FOR SELECT USING (status = 'published')` - Public read only published sales
- `sales_owner_read` - `FOR SELECT USING (auth.uid() = owner_id)` - Owner can read all their sales (including drafts)
- `sales_owner_insert` - `FOR INSERT WITH CHECK (auth.uid() = owner_id)` - Owner-only insert
- `sales_owner_update` - `FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id)` - Owner-only update
- `sales_owner_delete` - `FOR DELETE USING (auth.uid() = owner_id)` - Owner-only delete

**Indexes:** `idx_sales_owner_id_status` on `(owner_id, status) WHERE status = 'published'`, plus spatial and date indexes

### 2.3 `lootaura_v2.items`

**RLS Enabled:** Yes  
**Policies:**
- `items_public_read` - `FOR SELECT USING (EXISTS (SELECT 1 FROM lootaura_v2.sales WHERE id = sale_id AND status = 'published'))` - Public read only items from published sales
- `items_owner_insert` - `FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM lootaura_v2.sales WHERE id = sale_id AND owner_id = auth.uid()))` - Owner-only insert
- `items_owner_update` - `FOR UPDATE USING (EXISTS (...)) WITH CHECK (EXISTS (...))` - Owner-only update
- `items_owner_delete` - `FOR DELETE USING (EXISTS (...))` - Owner-only delete

**Indexes:** `idx_items_sale_id`, `idx_items_rls_sale_id`, `idx_items_sales_join`

### 2.4 `lootaura_v2.favorites`

**RLS Enabled:** Yes  
**Policies:**
- `favorites_owner_read` - `FOR SELECT USING (auth.uid() = user_id)` - Owner-only read
- `favorites_owner_insert` - `FOR INSERT WITH CHECK (auth.uid() = user_id)` - Owner-only insert
- `favorites_owner_delete` - `FOR DELETE USING (auth.uid() = user_id)` - Owner-only delete

**Indexes:** `idx_favorites_user_id`, `idx_favorites_rls_user_id`, `idx_favorites_rls_sale_id`

### 2.5 `lootaura_v2.reviews`

**RLS Enabled:** Yes  
**Policies:**
- `Reviews are viewable by everyone` - `FOR SELECT USING (true)` - Public read
- `Users can insert their own reviews` - `FOR INSERT WITH CHECK (auth.uid() = user_id)` - Owner-only insert
- `Users can update their own reviews` - `FOR UPDATE USING (auth.uid() = user_id)` - Owner-only update
- `Users can delete their own reviews` - `FOR DELETE USING (auth.uid() = user_id)` - Owner-only delete

**Indexes:** `reviews_sale_id_idx`, `reviews_user_id_idx`, `reviews_address_seller_idx`, `reviews_review_key_idx`

### 2.6 `lootaura_v2.zipcodes`

**RLS Enabled:** Yes  
**Policies:**
- `Zipcodes are viewable by everyone` - `FOR SELECT USING (true)` - Public read-only (reference data)

**Indexes:** `zipcodes_geom_gist_idx`, `zipcodes_zip_code_idx`

### 2.7 `lootaura_v2.sale_drafts`

**RLS Enabled:** Yes  
**Policies:**
- `select own drafts` - `FOR SELECT USING (auth.uid() = user_id)` - Owner-only read
- `insert own drafts` - `FOR INSERT WITH CHECK (auth.uid() = user_id)` - Owner-only insert
- `update own drafts` - `FOR UPDATE USING (auth.uid() = user_id)` - Owner-only update
- `delete own drafts` - `FOR DELETE USING (auth.uid() = user_id)` - Owner-only delete

**Indexes:** `sale_drafts_user_key` (unique on `(user_id, draft_key) WHERE status = 'active'`), `sale_drafts_user_status_updated`, `sale_drafts_expires_at`

### 2.8 `lootaura_v2.analytics_events`

**RLS Enabled:** Yes  
**Policies:**
- `ae_owner_select` - `FOR SELECT USING (owner_id = auth.uid())` - Owner-only read

**Writes:** Service role has full `SELECT, INSERT, UPDATE, DELETE` privileges (bypasses RLS)

**Indexes:** `idx_ae_sale_ts`, `idx_ae_owner_ts`, `idx_ae_type_ts`, `idx_ae_is_test`

### 2.9 `lootaura_v2.user_preferences`

**RLS Enabled:** Yes  
**Policies:**
- `user_prefs_select_self` - `FOR SELECT TO authenticated USING (user_id = auth.uid())` - Owner-only read
- `user_prefs_upsert_self` - `FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())` - Owner-only insert
- `user_prefs_update_self` - `FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())` - Owner-only update

**Indexes:** None explicit (PK on `user_id`)

### 2.10 `lootaura_v2.seller_settings`

**RLS Enabled:** Yes  
**Policies:**
- `seller_settings_select_self` - `FOR SELECT TO authenticated USING (user_id = auth.uid())` - Owner-only read
- `seller_settings_insert_self` - `FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())` - Owner-only insert
- `seller_settings_update_self` - `FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())` - Owner-only update
- `seller_settings_delete_self` - `FOR DELETE TO authenticated USING (user_id = auth.uid())` - Owner-only delete

**Indexes:** None explicit

### 2.11 `lootaura_v2.owner_stats`

**RLS Enabled:** Yes  
**Policies:**
- `owner_stats_read_all_auth` - `FOR SELECT TO authenticated USING (true)` - Authenticated users can read all stats
- `owner_stats_read_all_service` - `FOR SELECT TO service_role USING (true)` - Service role read

**Indexes:** None explicit (PK on `user_id`)

### 2.12 `lootaura_v2.seller_ratings`

**RLS Enabled:** Yes  
**Policies:**
- `seller_ratings_read_all` - `FOR SELECT TO anon, authenticated USING (true)` - Public read
- `seller_ratings_read_service` - `FOR SELECT TO service_role USING (true)` - Service role read
- `seller_ratings_insert_own` - `FOR INSERT TO authenticated WITH CHECK (rater_id = auth.uid() AND seller_id != auth.uid())` - Authenticated users can rate others
- `seller_ratings_update_own` - `FOR UPDATE TO authenticated USING (rater_id = auth.uid()) WITH CHECK (rater_id = auth.uid())` - Owner can update their rating
- `seller_ratings_delete_own` - `FOR DELETE TO authenticated USING (rater_id = auth.uid())` - Owner can delete their rating

**Indexes:** `idx_seller_ratings_seller_id`, `idx_seller_ratings_rater_id`

### 2.13 Internal Tables in `public` Schema

**`public.ingest_runs`:**
- RLS Enabled: Yes
- Policy: `ingest_runs_internal_only` - `FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role')` - Service-role only

**`public.geocode_cache`:**
- RLS Enabled: Yes
- Policy: `geocode_cache_internal_only` - `FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role')` - Service-role only

**`public.spatial_ref_sys`:**
- RLS Enabled: Yes (best-effort, may fail due to ownership)
- Policy: `spatial_ref_sys_internal_only` - `FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role')` - Service-role only

### 2.14 Legacy Tables in `public` Schema

**`public.yard_sales`:**
- RLS Enabled: Yes
- Policies: `Public read sales` (SELECT USING true), `Owners manage sales` (ALL USING owner_id)

**`public.favorites`:**
- RLS Enabled: Yes
- Policy: `Users manage favorites` (ALL USING user_id)

**`public.profiles`:**
- RLS Enabled: Yes
- Policy: `Users manage profile` (ALL USING id)

### 2.15 RLS Policy Issues & Recommendations

**✅ Strengths:**
- All `lootaura_v2` tables have RLS enabled
- Owner-only write policies are consistent (`auth.uid() = owner_id/user_id`)
- Public read policies correctly filter by `status = 'published'` for sales
- Internal tables have service-role-only policies

**⚠️ Potential Issues:**
1. **`profiles_public_read` is permissive** - Allows table-level read of all profiles (mitigated by view column filtering)
2. **`owner_stats_read_all_auth` allows all authenticated users to read all stats** - Consider if this is intended (may be for seller discovery)
3. **`seller_ratings_read_all` allows anonymous read** - Intentional for public ratings display
4. **No explicit DELETE policies on some tables** - Implicit deny (safe, but consider explicit policies for clarity)

**🔒 Recommendations:**
- Consider tightening `profiles_public_read` if stricter privacy is desired
- Document the intent of `owner_stats_read_all_auth` (seller discovery vs. privacy)
- Add explicit DELETE policies where appropriate for clarity

---

## 3. PostgREST Exposure

### 3.1 Exposed Tables (via Views)

All app-facing data is exposed through `public.*_v2` views:

- `public.sales_v2` - **GRANT SELECT, INSERT, UPDATE, DELETE TO anon, authenticated**
- `public.items_v2` - **GRANT SELECT, INSERT, UPDATE, DELETE TO anon, authenticated**
- `public.favorites_v2` - **GRANT SELECT, INSERT, UPDATE, DELETE TO anon, authenticated**
- `public.profiles_v2` - **GRANT SELECT, INSERT, UPDATE, DELETE TO anon, authenticated**
- `public.zipcodes_v2` - **GRANT SELECT, INSERT, UPDATE, DELETE TO anon, authenticated**
- `public.reviews_v2` - Exposed (grants not explicitly shown in migrations, but view exists)
- `public.user_preferences` - **GRANT SELECT, INSERT, UPDATE TO authenticated**
- `public.seller_settings` - **GRANT SELECT TO anon, authenticated**
- `public.owner_stats` - **GRANT SELECT TO anon, authenticated**
- `public.analytics_events_v2` - **GRANT SELECT TO authenticated**
- `public.seller_ratings` - **GRANT SELECT TO anon, authenticated**
- `public.sale_drafts` - **GRANT SELECT, INSERT, UPDATE, DELETE TO anon, authenticated**

### 3.2 Exposed RPC Functions

**Search Functions:**
- `public.search_sales_within_distance_v2(...)` - **GRANT EXECUTE TO anon, authenticated**
- `public.search_sales_bbox_v2(...)` - **GRANT EXECUTE TO anon, authenticated**

**Profile Management:**
- `public.update_profile(...)` - **GRANT EXECUTE TO authenticated** (SECURITY DEFINER)
- `public.get_profile(p_user_id)` - **GRANT EXECUTE TO authenticated** (SECURITY DEFINER)

**Data Management:**
- `public.upsert_zipcodes(zipcodes_json)` - **GRANT EXECUTE TO authenticated, anon** (SECURITY DEFINER)

### 3.3 Sensitive Tables NOT Exposed

**✅ Correctly Protected:**
- `lootaura_v2.*` base tables - Not directly exposed (only via views)
- `public.ingest_runs` - Internal-only, service-role access
- `public.geocode_cache` - Internal-only, service-role access
- `public.spatial_ref_sys` - PostGIS system table, not exposed

### 3.4 PostgREST Security Assessment

**✅ Strengths:**
- Base tables in `lootaura_v2` are not directly exposed
- All app-facing access goes through views with RLS enforcement
- Internal tables have restrictive policies
- SECURITY DEFINER functions are limited to profile/ZIP management

**⚠️ Considerations:**
- `public.upsert_zipcodes` is SECURITY DEFINER and granted to `anon` - Consider restricting to authenticated/admin only
- `public.update_profile` and `public.get_profile` are SECURITY DEFINER but should validate `p_user_id = auth.uid()` (implementation may vary)
- View grants allow DELETE on some views - Ensure RLS policies prevent unauthorized deletes

---

## 4. Function Security Posture

### 4.1 Search Path Hardening

**Status:** ✅ **FIXED** (via `094_function_search_path_hardening.sql`)

All flagged functions now have fixed `search_path`:
- **Public functions:** `pg_catalog, public, lootaura_v2`
- **lootaura_v2 functions:** `pg_catalog, public, lootaura_v2`

**Functions Hardened:**
- `public.search_sales_bbox_v2`, `public.search_sales_within_distance_v2`
- `public.items_v2_insert`, `public.items_v2_update`, `public.items_v2_delete`
- `public.get_user_review`, `public.get_sale_rating`, `public.get_address_seller_reviews`
- `public.search_sales`, `public.update_sale_search_tsv`, `public.update_updated_at_column`
- `lootaura_v2.normalize_address`, `lootaura_v2.set_geom_from_coords`, `lootaura_v2.sync_sales_geom`
- `lootaura_v2.set_updated_at`, `lootaura_v2.update_seller_ratings_updated_at`, `lootaura_v2.compute_review_key`
- `lootaura_v2.items_v2_update` (if exists)

### 4.2 SECURITY Mode Analysis

**SECURITY INVOKER Functions:**
- All search functions (`search_sales_*`)
- Most trigger functions
- View trigger functions

**SECURITY DEFINER Functions:**
- `public.update_profile` - Profile updates (should validate `p_user_id = auth.uid()`)
- `public.get_profile` - Profile reads (should validate `p_user_id = auth.uid()`)
- `public.upsert_zipcodes` - ZIP code bulk upsert (granted to anon - consider restricting)
- `lootaura_v2.cleanup_sale_drafts` - Draft cleanup (internal)
- `lootaura_v2.update_owner_stats_ratings` - Rating aggregation (internal)
- `lootaura_v2.bump_owner_stats_ratings_*` - Rating trigger functions (internal)

### 4.3 Function RLS Bypass Analysis

**Functions that Bypass RLS:**
- SECURITY DEFINER functions run with definer's privileges, potentially bypassing RLS
- `public.update_profile` and `public.get_profile` read/write directly to `lootaura_v2.profiles` (should validate `auth.uid()`)
- `public.upsert_zipcodes` writes directly to `lootaura_v2.zipcodes` (should validate permissions)

**Functions that Respect RLS:**
- SECURITY INVOKER functions run with caller's privileges, respecting RLS
- All search functions query through views/tables with RLS enabled

### 4.4 PostGIS Usage

**Functions Using PostGIS:**
- `public.search_sales_within_distance_v2` - Uses `ST_DWithin`, `ST_Distance`, `ST_MakePoint`, `ST_SetSRID`
- `public.search_sales_bbox_v2` - Fallback bbox search (no PostGIS, uses haversine)
- `lootaura_v2.set_geom_from_coords` - Uses `ST_MakePoint`, `ST_SetSRID`
- Trigger functions that set geometry columns

**PostGIS Extension:**
- Installed in `public` schema (platform-level, cannot be changed)
- Warning: `extension_in_public` lint (infrastructure-level, not fixable via migrations)

### 4.5 Function Security Recommendations

**✅ Strengths:**
- Search path is now fixed for all functions
- Most functions are SECURITY INVOKER (respects RLS)
- SECURITY DEFINER functions are limited and documented

**⚠️ Recommendations:**
1. **Validate `auth.uid()` in SECURITY DEFINER functions** - `update_profile` and `get_profile` should verify `p_user_id = auth.uid()`
2. **Restrict `upsert_zipcodes` to authenticated/admin** - Currently granted to `anon`
3. **Document SECURITY DEFINER functions** - Ensure all bypass RLS intentionally and safely
4. **Consider function-level RLS checks** - Add explicit `auth.uid()` checks in SECURITY DEFINER functions

---

## 5. Map Data Model Integrity

### 5.1 Map-Centric Architecture

**Design Pattern:**
- **Map is source of truth** for visible sales
- **Bbox-based queries** drive map pin rendering
- **Filters are applied server-side** before returning results
- **Client-side filtering** is secondary (for viewport culling)

### 5.2 Bbox Search Implementation

**Primary Search Path:**
1. Client sends bbox (`north`, `south`, `east`, `west`) to `/api/sales`
2. Server expands bbox by 50% buffer for pre-fetch
3. Server queries `public.sales_v2` with bbox filters:
   ```sql
   .gte('lat', minLat).lte('lat', maxLat)
   .gte('lng', minLng).lte('lng', maxLng)
   .eq('status', 'published')
   ```
4. Additional filters applied (date range, categories, distance)
5. Results returned to client

**Fallback Search Path:**
- If PostGIS available: `public.search_sales_within_distance_v2` (uses `ST_DWithin`)
- If PostGIS unavailable: `public.search_sales_bbox_v2` (uses haversine + bbox)

### 5.3 RLS Enforcement in Map Queries

**Sales Visibility:**
- `sales_public_read` policy: `status = 'published'` ✅
- Bbox queries filter by `status = 'published'` ✅
- RLS is enforced at table level, so views respect it ✅

**Items Visibility:**
- `items_public_read` policy: Only items from published sales ✅
- Items are filtered by sale status via EXISTS subquery ✅

### 5.4 Filter Application Order

**Server-Side (API):**
1. Bbox filter (lat/lng bounds)
2. Status filter (`status = 'published'`)
3. Date range filter (if provided)
4. Category/tags filter (if provided)
5. Distance filter (if provided, via PostGIS or haversine)
6. Text search filter (if provided)

**Client-Side (Viewport Culling):**
- `filterSalesForViewport()` filters results to visible viewport
- Prevents rendering pins outside visible map area

### 5.5 Map Data Model Integrity Assessment

**✅ Strengths:**
- Map bbox is authoritative for visible sales
- RLS policies correctly filter by `status = 'published'`
- Server-side filters are applied before returning results
- PostGIS spatial queries are efficient (GIST indexes)

**⚠️ Potential Issues:**
1. **Bbox expansion (50% buffer)** may return sales outside visible area - Intentional for pre-fetch, but client should filter
2. **Distance filter vs. bbox filter** - If both provided, behavior may be unclear (distance takes precedence in some code paths)
3. **No explicit "map bounds authority" policy** - Filters could theoretically bypass map visibility (mitigated by RLS)

**🔒 Recommendations:**
1. **Document bbox expansion behavior** - 50% buffer is intentional for pre-fetch
2. **Clarify filter precedence** - Document which filter takes precedence when multiple are provided
3. **Consider explicit "map visibility" policy** - Add RLS policy that enforces bbox constraints (may be overkill)

---

## 6. Cron + Email System Schema

### 6.1 Cron Job Dependencies

**`/api/cron/favorites-starting-soon`:**
- **Tables Used:**
  - `lootaura_v2.favorites` - Query favorites with `start_soon_notified_at IS NULL`
  - `lootaura_v2.sales` - Query published sales starting within time window
  - `auth.users` - Fetch user emails via Admin API
- **Functions Used:**
  - None (direct table queries via service role)
- **RLS Bypass:** Uses `getAdminDb()` (service role) to bypass RLS
- **Idempotency:** `start_soon_notified_at` column prevents duplicate notifications

**`/api/cron/seller-weekly-analytics`:**
- **Tables Used:**
  - `lootaura_v2.sales` - Query published sales in time window
  - `lootaura_v2.analytics_events` - Query events for owners in time window
  - `auth.users` - Fetch user emails via Admin API
  - `lootaura_v2.owner_stats` - Read aggregated stats (if used)
- **Functions Used:**
  - `getSellerWeeklyAnalytics()` - Aggregates metrics from `analytics_events`
- **RLS Bypass:** Uses `getAdminDb()` (service role) to bypass RLS
- **Idempotency:** Time window calculation (last full week) prevents duplicates

### 6.2 Email System Tables

**No dedicated email tables** - Email sending is handled by:
- Resend API (external service)
- Environment variables (`LOOTAURA_ENABLE_EMAILS`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`)
- Email templates in `lib/email/templates/`

**Email Preferences:**
- `lootaura_v2.user_preferences.email_opt_in` - User email opt-in
- `lootaura_v2.seller_settings.email_opt_in` - Seller email opt-in

### 6.3 Cron Job Security

**Authentication:**
- All cron endpoints require `CRON_SECRET` Bearer token
- Validated via `assertCronAuthorized()` in `lib/auth/cron.ts`

**Service Role Usage:**
- Cron jobs use `getAdminDb()` to bypass RLS
- Necessary for:
  - Reading all favorites (not just user's own)
  - Reading all sales (not just published)
  - Reading user emails via Admin API
  - Updating `start_soon_notified_at` on favorites

**Security Assessment:**
- ✅ Cron endpoints are protected by Bearer token
- ✅ Service role usage is intentional and necessary
- ✅ No sensitive data is exposed via cron endpoints (only job status)
- ⚠️ Service role has full access - Ensure cron endpoints are not publicly accessible

### 6.4 Cron Job Schema Recommendations

**✅ Strengths:**
- Idempotency mechanisms in place (`start_soon_notified_at`, time windows)
- Service role usage is documented and intentional
- No dedicated email tables (keeps schema simple)

**⚠️ Recommendations:**
1. **Consider email log table** - Track sent emails for debugging/audit (optional)
2. **Document service role usage** - Ensure all cron jobs are documented
3. **Monitor cron job execution** - Consider adding execution logs to `public.ingest_runs` or similar

---

## 7. Production Hardening Gaps

### 7.1 Error Logging

**Current State:**
- Sentry integration for error tracking (`@sentry/nextjs`)
- Logger utility (`lib/log`) for structured logging
- No database-level error logging tables

**Gaps:**
- No centralized error log table in database
- Errors are logged to external services (Sentry) only
- No retention policy for error logs

**Recommendations:**
- Consider adding `lootaura_v2.error_logs` table for critical errors
- Implement retention policy (e.g., 30 days)
- Add indexes on `error_type`, `ts` for querying

### 7.2 Idempotency for Cron Jobs

**Current State:**
- ✅ `favorites-starting-soon`: Uses `start_soon_notified_at` column
- ✅ `seller-weekly-analytics`: Uses time window calculation
- ✅ Both jobs are idempotent

**Gaps:**
- No explicit idempotency keys for other potential cron jobs
- No job execution log table (relies on external logging)

**Recommendations:**
- Consider adding `public.cron_job_runs` table for execution tracking
- Add idempotency keys for all cron jobs
- Track execution time, success/failure, error messages

### 7.3 High-Volume Search Performance

**Current Indexes:**
- ✅ Spatial indexes: `sales_geom_gist_idx` (GIST on `geom`)
- ✅ Status indexes: `idx_sales_owner_id_status` (composite)
- ✅ Date indexes: `sales_starts_at_idx`, `sales_date_start_idx`
- ✅ Text search: Full-text search indexes (if `update_sale_search_tsv` is used)

**Gaps:**
- No explicit index on `tags` array column (used for category filtering)
- No composite index on `(status, date_start, tags)` for common query patterns
- No index on `(lat, lng)` for bbox queries (may use spatial index instead)

**Recommendations:**
1. **Add GIN index on `tags`** - `CREATE INDEX idx_sales_tags_gin ON lootaura_v2.sales USING GIN (tags);`
2. **Monitor query performance** - Use `pg_stat_statements` to identify slow queries
3. **Consider partial indexes** - `CREATE INDEX idx_sales_published_tags ON lootaura_v2.sales USING GIN (tags) WHERE status = 'published';`

### 7.4 Missing Indexes (Inferred)

**Potential Missing Indexes:**
1. **`lootaura_v2.sales.tags`** - GIN index for array overlap queries (`tags && categories`)
2. **`lootaura_v2.favorites.start_soon_notified_at`** - Index exists (`idx_favorites_start_soon_notified`) ✅
3. **`lootaura_v2.analytics_events.owner_id`** - Index exists (`idx_ae_owner_ts`) ✅
4. **Composite index on `(status, date_start, tags)`** - May improve common query patterns

**Note:** Do NOT create these indexes without query analysis. Use `pg_stat_user_indexes` to identify actual usage patterns.

### 7.5 Production Hardening Summary

**✅ Strengths:**
- Spatial indexes are in place
- RLS performance indexes are optimized
- Cron jobs are idempotent
- Error logging is external (Sentry)

**⚠️ Gaps:**
- No database-level error log table
- No explicit job execution log table
- Potential missing indexes on `tags` array
- No retention policies for analytics events

**🔒 Recommendations:**
1. **Add GIN index on `tags`** if category filtering is slow
2. **Consider error log table** for critical errors
3. **Implement analytics retention policy** (e.g., 6-12 months)
4. **Monitor query performance** using `pg_stat_statements`

---

## Summary of Recommended Actions (no code)

### High Priority

1. **Validate `auth.uid()` in SECURITY DEFINER functions**
   - `public.update_profile` and `public.get_profile` should verify `p_user_id = auth.uid()`
   - Prevents users from updating other users' profiles

2. **Restrict `public.upsert_zipcodes` to authenticated/admin**
   - Currently granted to `anon` - Consider restricting to authenticated or admin-only
   - Prevents anonymous bulk ZIP code updates

3. **Add GIN index on `lootaura_v2.sales.tags`**
   - If category filtering is slow, add: `CREATE INDEX idx_sales_tags_gin ON lootaura_v2.sales USING GIN (tags);`
   - Monitor query performance first before creating

### Medium Priority

4. **Document SECURITY DEFINER functions**
   - Ensure all functions that bypass RLS are documented
   - Add comments explaining why SECURITY DEFINER is necessary

5. **Consider tightening `profiles_public_read` policy**
   - If stricter privacy is desired, consider adding column-level restrictions
   - Currently allows table-level read (mitigated by view)

6. **Implement analytics retention policy**
   - Add retention policy for `lootaura_v2.analytics_events` (e.g., 6-12 months)
   - Prevents unbounded growth of analytics data

### Low Priority

7. **Consider error log table**
   - Add `lootaura_v2.error_logs` table for critical errors
   - Implement retention policy (e.g., 30 days)

8. **Consider cron job execution log table**
   - Add `public.cron_job_runs` table for execution tracking
   - Track execution time, success/failure, error messages

9. **Monitor query performance**
   - Use `pg_stat_statements` to identify slow queries
   - Use `pg_stat_user_indexes` to identify unused indexes

10. **Document map data model**
    - Document bbox expansion behavior (50% buffer)
    - Clarify filter precedence when multiple filters are provided

---

## Appendix: Migration Files Reference

**Core Schema:**
- `033_safe_lootaura_v2_schema.sql` - Base tables and RLS
- `034_public_v2_wrappers.sql` - Public views and RPC functions
- `047_rls_hardening.sql` - RLS policy hardening

**Security Fixes:**
- `093_supabase_security_lints_fix.sql` - SECURITY INVOKER views, internal table RLS
- `094_function_search_path_hardening.sql` - Function search_path fixes

**Analytics & Features:**
- `081_create_analytics_events.sql` - Analytics events table
- `082_create_analytics_views.sql` - Analytics views
- `054_create_owner_stats_table.sql` - Owner stats
- `086_create_seller_ratings_table.sql` - Seller ratings
- `067_create_sale_drafts.sql` - Sale drafts
- `092_add_start_soon_notified_at_to_favorites.sql` - Email notification tracking

**Functions:**
- `064_create_profile_update_rpc.sql` - Profile update RPC
- `065_create_get_profile_rpc.sql` - Profile read RPC
- `053_insert_zipcodes_rpc.sql` - ZIP code upsert RPC

---

**End of Report**





