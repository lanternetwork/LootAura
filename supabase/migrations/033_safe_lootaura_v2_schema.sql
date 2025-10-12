-- Safe migration to create lootaura_v2 schema with column existence checks
-- This migration handles cases where tables might already exist with different structures

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS lootaura_v2;

-- Drop existing tables if they exist (to ensure clean state)
DROP TABLE IF EXISTS lootaura_v2.reviews CASCADE;
DROP TABLE IF EXISTS lootaura_v2.favorites CASCADE;
DROP TABLE IF EXISTS lootaura_v2.items CASCADE;
DROP TABLE IF EXISTS lootaura_v2.sales CASCADE;
DROP TABLE IF EXISTS lootaura_v2.profiles CASCADE;
DROP TABLE IF EXISTS lootaura_v2.zipcodes CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS lootaura_v2.set_geom_from_coords() CASCADE;

-- Create profiles table
CREATE TABLE lootaura_v2.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    home_zip TEXT,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sales table with geometry column
CREATE TABLE lootaura_v2.sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    zip_code TEXT,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    geom GEOMETRY(POINT, 4326),
    date_start DATE NOT NULL,
    time_start TIME,
    date_end DATE,
    time_end TIME,
    starts_at TIMESTAMPTZ,
    status TEXT DEFAULT 'published'::text NOT NULL,
    is_featured BOOLEAN DEFAULT false NOT NULL,
    CONSTRAINT sales_status_check CHECK (status IN ('published', 'draft', 'archived', 'active'))
);

-- Create items table
CREATE TABLE lootaura_v2.items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2),
    image_url TEXT
);

-- Create favorites table
CREATE TABLE lootaura_v2.favorites (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, sale_id)
);

-- Create reviews table
CREATE TABLE lootaura_v2.reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    address TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    CONSTRAINT reviews_address_seller_user_unique UNIQUE (address, seller_id, user_id)
);

-- Create zipcodes table
CREATE TABLE lootaura_v2.zipcodes (
    zip_code TEXT PRIMARY KEY,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    geom GEOMETRY(POINT, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger function to set geometry from lat/lng and populate starts_at
CREATE OR REPLACE FUNCTION lootaura_v2.set_geom_from_coords()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    
    -- Populate starts_at from date_start and time_start
    IF NEW.date_start IS NOT NULL AND NEW.time_start IS NOT NULL THEN
        NEW.starts_at = (NEW.date_start + NEW.time_start)::TIMESTAMPTZ;
    ELSIF NEW.date_start IS NOT NULL THEN
        NEW.starts_at = NEW.date_start::TIMESTAMPTZ;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sales table
CREATE TRIGGER sales_set_geom_trigger
    BEFORE INSERT OR UPDATE ON lootaura_v2.sales
    FOR EACH ROW
    EXECUTE FUNCTION lootaura_v2.set_geom_from_coords();

-- Create trigger for zipcodes table
CREATE TRIGGER zipcodes_set_geom_trigger
    BEFORE INSERT OR UPDATE ON lootaura_v2.zipcodes
    FOR EACH ROW
    EXECUTE FUNCTION lootaura_v2.set_geom_from_coords();

-- Create indexes
CREATE INDEX sales_geom_gist_idx ON lootaura_v2.sales USING GIST (geom);
CREATE INDEX sales_starts_at_idx ON lootaura_v2.sales (starts_at);
CREATE INDEX sales_owner_id_idx ON lootaura_v2.sales (owner_id);
CREATE INDEX sales_status_idx ON lootaura_v2.sales (status);
CREATE INDEX sales_lat_lng_idx ON lootaura_v2.sales (lat, lng);

CREATE INDEX items_sale_id_idx ON lootaura_v2.items (sale_id);
CREATE INDEX favorites_user_id_idx ON lootaura_v2.favorites (user_id);
CREATE INDEX favorites_sale_id_idx ON lootaura_v2.favorites (sale_id);
CREATE INDEX reviews_sale_id_idx ON lootaura_v2.reviews (sale_id);
CREATE INDEX reviews_user_id_idx ON lootaura_v2.reviews (user_id);
CREATE INDEX reviews_address_seller_idx ON lootaura_v2.reviews (address, seller_id);

CREATE INDEX zipcodes_geom_gist_idx ON lootaura_v2.zipcodes USING GIST (geom);
CREATE INDEX zipcodes_zip_code_idx ON lootaura_v2.zipcodes (zip_code);

-- Enable Row Level Security
ALTER TABLE lootaura_v2.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.zipcodes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON lootaura_v2.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON lootaura_v2.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON lootaura_v2.profiles;

DROP POLICY IF EXISTS "Sales are viewable by everyone." ON lootaura_v2.sales;
DROP POLICY IF EXISTS "Users can insert their own sales." ON lootaura_v2.sales;
DROP POLICY IF EXISTS "Users can update own sales." ON lootaura_v2.sales;

DROP POLICY IF EXISTS "Items are viewable by everyone." ON lootaura_v2.items;
DROP POLICY IF EXISTS "Users can insert items for their sales." ON lootaura_v2.items;
DROP POLICY IF EXISTS "Users can update items for their sales." ON lootaura_v2.items;

DROP POLICY IF EXISTS "Favorites are viewable by owner." ON lootaura_v2.favorites;
DROP POLICY IF EXISTS "Users can insert their own favorites." ON lootaura_v2.favorites;
DROP POLICY IF EXISTS "Users can delete their own favorites." ON lootaura_v2.favorites;

DROP POLICY IF EXISTS "Reviews are viewable by everyone." ON lootaura_v2.reviews;
DROP POLICY IF EXISTS "Users can insert their own reviews." ON lootaura_v2.reviews;
DROP POLICY IF EXISTS "Users can update their own reviews." ON lootaura_v2.reviews;
DROP POLICY IF EXISTS "Users can delete their own reviews." ON lootaura_v2.reviews;

DROP POLICY IF EXISTS "Zipcodes are viewable by everyone." ON lootaura_v2.zipcodes;

-- Create RLS policies for profiles
CREATE POLICY "Public profiles are viewable by everyone." ON lootaura_v2.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON lootaura_v2.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON lootaura_v2.profiles FOR UPDATE USING (auth.uid() = id);

-- Create RLS policies for sales
CREATE POLICY "Sales are viewable by everyone." ON lootaura_v2.sales FOR SELECT USING (true);
CREATE POLICY "Users can insert their own sales." ON lootaura_v2.sales FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own sales." ON lootaura_v2.sales FOR UPDATE USING (auth.uid() = owner_id);

-- Create RLS policies for items
CREATE POLICY "Items are viewable by everyone." ON lootaura_v2.items FOR SELECT USING (true);
CREATE POLICY "Users can insert items for their sales." ON lootaura_v2.items FOR INSERT WITH CHECK ((SELECT owner_id FROM lootaura_v2.sales WHERE id = sale_id) = auth.uid());
CREATE POLICY "Users can update items for their sales." ON lootaura_v2.items FOR UPDATE USING ((SELECT owner_id FROM lootaura_v2.sales WHERE id = sale_id) = auth.uid());

-- Create RLS policies for favorites
CREATE POLICY "Favorites are viewable by owner." ON lootaura_v2.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own favorites." ON lootaura_v2.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own favorites." ON lootaura_v2.favorites FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for reviews
CREATE POLICY "Reviews are viewable by everyone." ON lootaura_v2.reviews FOR SELECT USING (true);
CREATE POLICY "Users can insert their own reviews." ON lootaura_v2.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reviews." ON lootaura_v2.reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reviews." ON lootaura_v2.reviews FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for zipcodes (read-only for all)
CREATE POLICY "Zipcodes are viewable by everyone." ON lootaura_v2.zipcodes FOR SELECT USING (true);

-- Verify the schema was created
DO $$
DECLARE
    sales_count integer;
    profiles_count integer;
    items_count integer;
    favorites_count integer;
    reviews_count integer;
    zipcodes_count integer;
BEGIN
    SELECT COUNT(*) INTO sales_count FROM lootaura_v2.sales;
    SELECT COUNT(*) INTO profiles_count FROM lootaura_v2.profiles;
    SELECT COUNT(*) INTO items_count FROM lootaura_v2.items;
    SELECT COUNT(*) INTO favorites_count FROM lootaura_v2.favorites;
    SELECT COUNT(*) INTO reviews_count FROM lootaura_v2.reviews;
    SELECT COUNT(*) INTO zipcodes_count FROM lootaura_v2.zipcodes;
    
    RAISE NOTICE 'Lootaura_v2 schema created successfully!';
    RAISE NOTICE 'Sales: %, Profiles: %, Items: %, Favorites: %, Reviews: %, Zipcodes: %', 
        sales_count, profiles_count, items_count, favorites_count, reviews_count, zipcodes_count;
END $$;

