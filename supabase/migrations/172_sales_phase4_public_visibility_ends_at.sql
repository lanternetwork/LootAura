-- Phase 4: public visibility for listing end (ends_at) + moderation + archived alignment.
-- Keeps ends_at IS NULL visible during transition (no NOT NULL / mass fail-close).
-- Aligns sales_public_read with lootaura_v2.is_sale_publicly_visible (items_public_read).

-- ---------------------------------------------------------------------------
-- RLS: public read on sales (anon + authenticated non-owner path)
-- Predicate (documented):
--   status = 'published'
--   AND archived_at IS NULL
--   AND (ends_at IS NULL OR ends_at > now())
--   AND (moderation_status IS DISTINCT FROM 'hidden_by_admin')
-- Boundary: ends_at <= now() is not public; ends_at > now() is public.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "sales_public_read" ON lootaura_v2.sales;

CREATE POLICY "sales_public_read" ON lootaura_v2.sales
    FOR SELECT
    TO anon, authenticated
    USING (
        status = 'published'
        AND archived_at IS NULL
        AND (ends_at IS NULL OR ends_at > now())
        AND (moderation_status IS DISTINCT FROM 'hidden_by_admin')
    );

COMMENT ON POLICY "sales_public_read" ON lootaura_v2.sales IS
    'Phase 4 public read: published, not archived, not admin-hidden, and (NULL ends_at OR ends_at strictly in the future). NULL ends_at remains visible until backlog backfill + later fail-close.';

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: must match sales_public_read exactly (items_public_read)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lootaura_v2.is_sale_publicly_visible(sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, pg_catalog
STABLE
AS $$
DECLARE
    sale_status text;
    sale_archived_at timestamptz;
    sale_ends_at timestamptz;
    sale_moderation text;
BEGIN
    SELECT s.status, s.archived_at, s.ends_at, s.moderation_status
    INTO sale_status, sale_archived_at, sale_ends_at, sale_moderation
    FROM lootaura_v2.sales s
    WHERE s.id = sale_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF sale_status IS DISTINCT FROM 'published' THEN
        RETURN false;
    END IF;

    IF sale_archived_at IS NOT NULL THEN
        RETURN false;
    END IF;

    IF sale_ends_at IS NOT NULL AND sale_ends_at <= now() THEN
        RETURN false;
    END IF;

    IF sale_moderation IS NOT DISTINCT FROM 'hidden_by_admin' THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION lootaura_v2.is_sale_publicly_visible(uuid) IS
    'Phase 4: true when sale matches sales_public_read (published, not archived, not hidden_by_admin, NULL ends_at OR ends_at > now()). Used by items_public_read.';

REVOKE EXECUTE ON FUNCTION lootaura_v2.is_sale_publicly_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lootaura_v2.is_sale_publicly_visible(uuid) TO anon, authenticated;

COMMENT ON POLICY "items_public_read" ON lootaura_v2.items IS
    'Public items when is_sale_publicly_visible(sale_id) — aligned with sales_public_read (Phase 4, migration 172).';

-- ---------------------------------------------------------------------------
-- PostGIS helpers: defense-in-depth (same predicate in WHERE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lootaura_v2.get_sales_within_distance(
    user_lat DECIMAL,
    user_lng DECIMAL,
    distance_meters INTEGER,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
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
    price DECIMAL,
    tags TEXT[],
    status TEXT,
    privacy_mode TEXT,
    is_featured BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    distance_meters DECIMAL
) AS $$
BEGIN
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
        s.price,
        s.tags,
        s.status,
        s.privacy_mode,
        s.is_featured,
        s.created_at,
        s.updated_at,
        ST_Distance(s.geom, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography) AS distance_meters
    FROM lootaura_v2.sales s
    WHERE s.status = 'published'
        AND s.archived_at IS NULL
        AND (s.ends_at IS NULL OR s.ends_at > now())
        AND (s.moderation_status IS DISTINCT FROM 'hidden_by_admin')
        AND s.geom IS NOT NULL
        AND ST_DWithin(
            s.geom,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            distance_meters
        )
    ORDER BY ST_Distance(s.geom, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography)
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION lootaura_v2.search_sales_within_distance(
    user_lat DECIMAL,
    user_lng DECIMAL,
    distance_meters INTEGER,
    search_city TEXT DEFAULT NULL,
    search_categories TEXT[] DEFAULT NULL,
    date_start_filter DATE DEFAULT NULL,
    date_end_filter DATE DEFAULT NULL,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
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
    price DECIMAL,
    tags TEXT[],
    status TEXT,
    privacy_mode TEXT,
    is_featured BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    distance_meters DECIMAL
) AS $$
BEGIN
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
        s.price,
        s.tags,
        s.status,
        s.privacy_mode,
        s.is_featured,
        s.created_at,
        s.updated_at,
        ST_Distance(s.geom, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography) AS distance_meters
    FROM lootaura_v2.sales s
    WHERE s.status = 'published'
        AND s.archived_at IS NULL
        AND (s.ends_at IS NULL OR s.ends_at > now())
        AND (s.moderation_status IS DISTINCT FROM 'hidden_by_admin')
        AND s.geom IS NOT NULL
        AND ST_DWithin(
            s.geom,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            distance_meters
        )
        AND (search_city IS NULL OR s.city ILIKE '%' || search_city || '%')
        AND (search_categories IS NULL OR s.tags && search_categories)
        AND (date_start_filter IS NULL OR s.date_start >= date_start_filter)
        AND (date_end_filter IS NULL OR s.date_start <= date_end_filter)
    ORDER BY ST_Distance(s.geom, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography)
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- public schema wrappers (SECURITY INVOKER; explicit WHERE matches RLS)
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
    p_limit := LEAST(p_limit, 100);

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
        ST_DWithin(search_point, s.geom, distance_meters)
        AND (p_start_date IS NULL OR s.date_start >= p_start_date)
        AND (p_end_date IS NULL OR s.date_start <= p_end_date)
        AND s.status IN ('published', 'active')
        AND s.archived_at IS NULL
        AND (s.ends_at IS NULL OR s.ends_at > now())
        AND (s.moderation_status IS DISTINCT FROM 'hidden_by_admin')
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
    p_limit := LEAST(p_limit, 100);

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
        s.lat BETWEEN min_lat AND max_lat
        AND s.lng BETWEEN min_lng AND max_lng
        AND (p_start_date IS NULL OR s.date_start >= p_start_date)
        AND (p_end_date IS NULL OR s.date_start <= p_end_date)
        AND s.status IN ('published', 'active')
        AND s.archived_at IS NULL
        AND (s.ends_at IS NULL OR s.ends_at > now())
        AND (s.moderation_status IS DISTINCT FROM 'hidden_by_admin')
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
