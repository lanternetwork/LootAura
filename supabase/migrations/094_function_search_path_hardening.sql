-- 094_function_search_path_hardening.sql
-- Purpose: Fix Supabase "function_search_path_mutable" lint warnings by setting
--          fixed search_path on all flagged functions.
--
-- This migration is designed to be:
--   - Minimal and backwards-compatible (only sets search_path, doesn't change function bodies)
--   - Idempotent (safe to re-run)
--
-- NOTES:
--   - Functions that access lootaura_v2 tables need: pg_catalog, public, lootaura_v2
--   - Functions that only use public schema need: pg_catalog, public
--   - We use a dynamic approach to find functions by name and set their search_path

-------------------------------
-- 1. Public functions that access lootaura_v2 tables
-------------------------------

-- These functions query lootaura_v2 tables, so they need lootaura_v2 in search_path
-- We set: pg_catalog, public, lootaura_v2

-- search_sales_bbox_v2 (from 034_public_v2_wrappers.sql)
ALTER FUNCTION public.search_sales_bbox_v2(
    p_lat DECIMAL,
    p_lng DECIMAL,
    p_distance_km DECIMAL,
    p_start_date DATE,
    p_end_date DATE,
    p_categories TEXT[],
    p_query TEXT,
    p_limit INTEGER,
    p_offset INTEGER
)
SET search_path = pg_catalog, public, lootaura_v2;

-- search_sales_within_distance_v2 (from 034_public_v2_wrappers.sql)
ALTER FUNCTION public.search_sales_within_distance_v2(
    p_lat DECIMAL,
    p_lng DECIMAL,
    p_distance_km DECIMAL,
    p_start_date DATE,
    p_end_date DATE,
    p_categories TEXT[],
    p_query TEXT,
    p_limit INTEGER,
    p_offset INTEGER
)
SET search_path = pg_catalog, public, lootaura_v2;

-- items_v2_insert, items_v2_update, items_v2_delete
-- These are likely trigger functions for the items_v2 view
-- We'll set search_path dynamically since we may not know exact signatures
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Find all overloads of items_v2_insert, items_v2_update, items_v2_delete
    FOR func_record IN
        SELECT 
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('items_v2_insert', 'items_v2_update', 'items_v2_delete')
    LOOP
        EXECUTE format(
            'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public, lootaura_v2',
            func_record.proname,
            func_record.args
        );
    END LOOP;
END
$$;

-- get_user_review, get_sale_rating, get_address_seller_reviews
-- Review-related functions that likely access lootaura_v2.reviews
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN
        SELECT 
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('get_user_review', 'get_sale_rating', 'get_address_seller_reviews')
    LOOP
        EXECUTE format(
            'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public, lootaura_v2',
            func_record.proname,
            func_record.args
        );
    END LOOP;
END
$$;

-- search_sales (legacy search function)
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN
        SELECT 
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'search_sales'
    LOOP
        EXECUTE format(
            'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public, lootaura_v2',
            func_record.proname,
            func_record.args
        );
    END LOOP;
END
$$;

-- update_sale_search_tsv (full-text search trigger)
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN
        SELECT 
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'update_sale_search_tsv'
    LOOP
        EXECUTE format(
            'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public, lootaura_v2',
            func_record.proname,
            func_record.args
        );
    END LOOP;
END
$$;

-- update_updated_at_column (generic updated_at trigger - may only use public)
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN
        SELECT 
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'update_updated_at_column'
    LOOP
        -- This function may only touch public schema, but we'll include lootaura_v2 to be safe
        EXECUTE format(
            'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public, lootaura_v2',
            func_record.proname,
            func_record.args
        );
    END LOOP;
END
$$;

-------------------------------
-- 2. lootaura_v2 functions
-------------------------------

-- normalize_address, set_geom_from_coords, sync_sales_geom, set_updated_at,
-- update_seller_ratings_updated_at, compute_review_key
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN
        SELECT 
            p.proname,
            pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'lootaura_v2'
          AND p.proname IN (
              'normalize_address',
              'set_geom_from_coords',
              'sync_sales_geom',
              'set_updated_at',
              'update_seller_ratings_updated_at',
              'compute_review_key'
          )
    LOOP
        EXECUTE format(
            'ALTER FUNCTION lootaura_v2.%I(%s) SET search_path = pg_catalog, public, lootaura_v2',
            func_record.proname,
            func_record.args
        );
    END LOOP;
END
$$;





