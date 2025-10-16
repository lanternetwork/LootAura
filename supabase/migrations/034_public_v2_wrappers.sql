-- Create public views and RPC functions to expose lootaura_v2 schema
-- This provides public access to v2 tables without schema switching

-- Drop existing views if they exist
DROP VIEW IF EXISTS public.sales_v2 CASCADE;
DROP VIEW IF EXISTS public.items_v2 CASCADE;
DROP VIEW IF EXISTS public.favorites_v2 CASCADE;
DROP VIEW IF EXISTS public.profiles_v2 CASCADE;
DROP VIEW IF EXISTS public.zipcodes_v2 CASCADE;

-- Drop existing functions if they exist (all variations)
DROP FUNCTION IF EXISTS public.search_sales_within_distance CASCADE;
DROP FUNCTION IF EXISTS public.search_sales_bbox CASCADE;

-- Create public views (column-for-column mapping)
CREATE VIEW public.sales_v2 AS
SELECT 
    id,
    created_at,
    updated_at,
    owner_id,
    title,
    description,
    address,
    city,
    state,
    zip_code,
    lat,
    lng,
    geom,
    date_start,
    time_start,
    date_end,
    time_end,
    starts_at,
    status,
    is_featured
FROM lootaura_v2.sales;

CREATE VIEW public.items_v2 AS
SELECT 
    id,
    created_at,
    sale_id,
    name,
    description,
    price,
    category,
    condition,
    images,
    is_sold,
    updated_at
FROM lootaura_v2.items;

CREATE VIEW public.favorites_v2 AS
SELECT 
    user_id,
    sale_id,
    created_at
FROM lootaura_v2.favorites;

CREATE VIEW public.profiles_v2 AS
SELECT 
    id,
    username,
    full_name,
    avatar_url,
    home_zip,
    preferences,
    created_at,
    updated_at
FROM lootaura_v2.profiles;

CREATE VIEW public.zipcodes_v2 AS
SELECT 
    zip_code,
    city,
    state,
    lat,
    lng,
    geom,
    created_at,
    updated_at
FROM lootaura_v2.zipcodes;

-- Grant permissions on views
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites_v2 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles_v2 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zipcodes_v2 TO anon, authenticated;

-- Create distance search RPC function
CREATE OR REPLACE FUNCTION public.search_sales_within_distance_v2(
    p_lat DECIMAL,
    p_lng DECIMAL,
    p_distance_km DECIMAL DEFAULT 40,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_categories TEXT[] DEFAULT NULL,
    p_query TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    title TEXT,
    description TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    lat DECIMAL,
    lng DECIMAL,
    date_start DATE,
    time_start TIME,
    date_end DATE,
    time_end TIME,
    starts_at TIMESTAMPTZ,
    status TEXT,
    is_featured BOOLEAN,
    distance_m DECIMAL,
    owner_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    search_point GEOMETRY;
    distance_meters DECIMAL;
BEGIN
    -- Cap limit at 100
    p_limit := LEAST(p_limit, 100);
    
    -- Create search point
    search_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);
    distance_meters := p_distance_km * 1000;
    
    RETURN QUERY
    SELECT 
        s.id,
        s.title,
        s.description,
        s.address,
        s.city,
        s.state,
        s.zip_code,
        s.lat,
        s.lng,
        s.date_start,
        s.time_start,
        s.date_end,
        s.time_end,
        s.starts_at,
        s.status,
        s.is_featured,
        ROUND(ST_Distance(search_point, s.geom)::DECIMAL, 2) as distance_m,
        s.owner_id,
        s.created_at,
        s.updated_at
    FROM lootaura_v2.sales s
    WHERE 
        -- Distance filter using PostGIS
        ST_DWithin(search_point, s.geom, distance_meters)
        -- Date range filter
        AND (p_start_date IS NULL OR s.date_start >= p_start_date)
        AND (p_end_date IS NULL OR s.date_start <= p_end_date)
        -- Status filter
        AND s.status IN ('published', 'active')
        -- Text search filter
        AND (p_query IS NULL OR (
            s.title ILIKE '%' || p_query || '%' OR 
            s.description ILIKE '%' || p_query || '%' OR
            s.address ILIKE '%' || p_query || '%'
        ))
    ORDER BY 
        ST_Distance(search_point, s.geom),
        s.starts_at DESC,
        s.id
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Create degraded bbox search function (fallback if PostGIS fails)
CREATE OR REPLACE FUNCTION public.search_sales_bbox_v2(
    p_lat DECIMAL,
    p_lng DECIMAL,
    p_distance_km DECIMAL DEFAULT 40,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_categories TEXT[] DEFAULT NULL,
    p_query TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    title TEXT,
    description TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    lat DECIMAL,
    lng DECIMAL,
    date_start DATE,
    time_start TIME,
    date_end DATE,
    time_end TIME,
    starts_at TIMESTAMPTZ,
    status TEXT,
    is_featured BOOLEAN,
    distance_m DECIMAL,
    owner_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    lat_range DECIMAL;
    lng_range DECIMAL;
    min_lat DECIMAL;
    max_lat DECIMAL;
    min_lng DECIMAL;
    max_lng DECIMAL;
BEGIN
    -- Cap limit at 100
    p_limit := LEAST(p_limit, 100);
    
    -- Calculate bounding box (approximate)
    -- 1 degree ≈ 111km, so for km distance: degrees = km/111
    lat_range := p_distance_km / 111.0;
    lng_range := p_distance_km / (111.0 * COS(RADIANS(p_lat)));
    
    min_lat := p_lat - lat_range;
    max_lat := p_lat + lat_range;
    min_lng := p_lng - lng_range;
    max_lng := p_lng + lng_range;
    
    RETURN QUERY
    SELECT 
        s.id,
        s.title,
        s.description,
        s.address,
        s.city,
        s.state,
        s.zip_code,
        s.lat,
        s.lng,
        s.date_start,
        s.time_start,
        s.date_end,
        s.time_end,
        s.starts_at,
        s.status,
        s.is_featured,
        -- Approximate distance using haversine formula
        ROUND(
            6371000 * ACOS(
                LEAST(1, 
                    COS(RADIANS(p_lat)) * COS(RADIANS(s.lat)) * 
                    COS(RADIANS(s.lng) - RADIANS(p_lng)) + 
                    SIN(RADIANS(p_lat)) * SIN(RADIANS(s.lat))
                )
            )::DECIMAL, 2
        ) as distance_m,
        s.owner_id,
        s.created_at,
        s.updated_at
    FROM lootaura_v2.sales s
    WHERE 
        -- Bounding box filter (approximate)
        s.lat BETWEEN min_lat AND max_lat
        AND s.lng BETWEEN min_lng AND max_lng
        -- Date range filter
        AND (p_start_date IS NULL OR s.date_start >= p_start_date)
        AND (p_end_date IS NULL OR s.date_start <= p_end_date)
        -- Status filter
        AND s.status IN ('published', 'active')
        -- Text search filter
        AND (p_query IS NULL OR (
            s.title ILIKE '%' || p_query || '%' OR 
            s.description ILIKE '%' || p_query || '%' OR
            s.address ILIKE '%' || p_query || '%'
        ))
    ORDER BY 
        distance_m,
        s.starts_at DESC,
        s.id
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Grant execute permissions on RPC functions
GRANT EXECUTE ON FUNCTION public.search_sales_within_distance_v2 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_sales_bbox_v2 TO anon, authenticated;

-- Verify the setup
DO $$
DECLARE
    sales_view_count integer;
    items_view_count integer;
    favorites_view_count integer;
    profiles_view_count integer;
    zipcodes_view_count integer;
BEGIN
    SELECT COUNT(*) INTO sales_view_count FROM public.sales_v2;
    SELECT COUNT(*) INTO items_view_count FROM public.items_v2;
    SELECT COUNT(*) INTO favorites_view_count FROM public.favorites_v2;
    SELECT COUNT(*) INTO profiles_view_count FROM public.profiles_v2;
    SELECT COUNT(*) INTO zipcodes_view_count FROM public.zipcodes_v2;
    
    RAISE NOTICE 'Public v2 wrappers created successfully!';
    RAISE NOTICE 'Views: sales_v2=%, items_v2=%, favorites_v2=%, profiles_v2=%, zipcodes_v2=%', 
        sales_view_count, items_view_count, favorites_view_count, profiles_view_count, zipcodes_view_count;
END $$;
