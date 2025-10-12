-- Create lootaura_v2 schema and base tables with RLS, triggers, and indexes
-- This migration creates the complete lootaura_v2 schema without touching public.yard_sales

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS lootaura_v2;

-- Create profiles table
CREATE TABLE IF NOT EXISTS lootaura_v2.profiles (
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
CREATE TABLE IF NOT EXISTS lootaura_v2.sales (
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
    starts_at TIMESTAMPTZ GENERATED ALWAYS AS (
        CASE 
            WHEN date_start IS NOT NULL AND time_start IS NOT NULL 
            THEN (date_start + time_start)::TIMESTAMPTZ
            WHEN date_start IS NOT NULL 
            THEN date_start::TIMESTAMPTZ
            ELSE NULL
        END
    ) STORED,
    status TEXT DEFAULT 'published'::text NOT NULL,
    is_featured BOOLEAN DEFAULT false NOT NULL,
    CONSTRAINT sales_status_check CHECK (status IN ('published', 'draft', 'archived', 'active'))
);

-- Create items table
CREATE TABLE IF NOT EXISTS lootaura_v2.items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2),
    image_url TEXT
);

-- Create favorites table
CREATE TABLE IF NOT EXISTS lootaura_v2.favorites (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (user_id, sale_id)
);

-- Create reviews table
CREATE TABLE IF NOT EXISTS lootaura_v2.reviews (
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

-- Create zipcodes table (upsert structure - don't drop existing data)
CREATE TABLE IF NOT EXISTS lootaura_v2.zipcodes (
    zip_code TEXT PRIMARY KEY,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lng DECIMAL(11, 8) NOT NULL,
    geom GEOMETRY(POINT, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger function to set geometry from lat/lng
CREATE OR REPLACE FUNCTION lootaura_v2.set_geom_from_coords()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sales table
DROP TRIGGER IF EXISTS sales_set_geom_trigger ON lootaura_v2.sales;
CREATE TRIGGER sales_set_geom_trigger
    BEFORE INSERT OR UPDATE ON lootaura_v2.sales
    FOR EACH ROW
    EXECUTE FUNCTION lootaura_v2.set_geom_from_coords();

-- Create trigger for zipcodes table
DROP TRIGGER IF EXISTS zipcodes_set_geom_trigger ON lootaura_v2.zipcodes;
CREATE TRIGGER zipcodes_set_geom_trigger
    BEFORE INSERT OR UPDATE ON lootaura_v2.zipcodes
    FOR EACH ROW
    EXECUTE FUNCTION lootaura_v2.set_geom_from_coords();

-- Create indexes
CREATE INDEX IF NOT EXISTS sales_geom_gist_idx ON lootaura_v2.sales USING GIST (geom);
CREATE INDEX IF NOT EXISTS sales_starts_at_idx ON lootaura_v2.sales (starts_at);
CREATE INDEX IF NOT EXISTS sales_owner_id_idx ON lootaura_v2.sales (owner_id);
CREATE INDEX IF NOT EXISTS sales_status_idx ON lootaura_v2.sales (status);
CREATE INDEX IF NOT EXISTS sales_lat_lng_idx ON lootaura_v2.sales (lat, lng);

CREATE INDEX IF NOT EXISTS items_sale_id_idx ON lootaura_v2.items (sale_id);
CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON lootaura_v2.favorites (user_id);
CREATE INDEX IF NOT EXISTS favorites_sale_id_idx ON lootaura_v2.favorites (sale_id);
CREATE INDEX IF NOT EXISTS reviews_sale_id_idx ON lootaura_v2.reviews (sale_id);
CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON lootaura_v2.reviews (user_id);
CREATE INDEX IF NOT EXISTS reviews_address_seller_idx ON lootaura_v2.reviews (address, seller_id);

CREATE INDEX IF NOT EXISTS zipcodes_geom_gist_idx ON lootaura_v2.zipcodes USING GIST (geom);
CREATE INDEX IF NOT EXISTS zipcodes_zip_code_idx ON lootaura_v2.zipcodes (zip_code);

-- Enable Row Level Security
ALTER TABLE lootaura_v2.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE lootaura_v2.zipcodes ENABLE ROW LEVEL SECURITY;

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
