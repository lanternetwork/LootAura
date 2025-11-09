-- Add INSTEAD OF triggers to sales_v2 view to enable INSERT, UPDATE, DELETE operations
-- PostgreSQL views are read-only by default and need INSTEAD OF triggers for writes
-- This is required because PostgREST can only access the 'public' schema, not 'lootaura_v2'

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS sales_v2_insert_trigger ON public.sales_v2;
DROP TRIGGER IF EXISTS sales_v2_update_trigger ON public.sales_v2;
DROP TRIGGER IF EXISTS sales_v2_delete_trigger ON public.sales_v2;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS public.sales_v2_insert();
DROP FUNCTION IF EXISTS public.sales_v2_update();
DROP FUNCTION IF EXISTS public.sales_v2_delete();

-- Create INSTEAD OF INSERT trigger function
CREATE OR REPLACE FUNCTION public.sales_v2_insert()
RETURNS TRIGGER AS $$
DECLARE
    inserted_id UUID;
BEGIN
    INSERT INTO lootaura_v2.sales (
        owner_id,
        title,
        description,
        address,
        city,
        state,
        zip_code,
        lat,
        lng,
        date_start,
        time_start,
        date_end,
        time_end,
        status,
        is_featured,
        pricing_mode,
        privacy_mode,
        cover_image_url,
        images,
        created_at,
        updated_at
    ) VALUES (
        NEW.owner_id,
        NEW.title,
        NEW.description,
        NEW.address,
        NEW.city,
        NEW.state,
        NEW.zip_code,
        NEW.lat,
        NEW.lng,
        NEW.date_start,
        NEW.time_start,
        NEW.date_end,
        NEW.time_end,
        COALESCE(NEW.status, 'published'),
        COALESCE(NEW.is_featured, FALSE),
        COALESCE(NEW.pricing_mode, 'negotiable'),
        COALESCE(NEW.privacy_mode, 'exact'),
        NEW.cover_image_url,
        NEW.images,
        COALESCE(NEW.created_at, NOW()),
        COALESCE(NEW.updated_at, NOW())
    )
    RETURNING id INTO inserted_id;
    
    -- Populate NEW with the inserted row data for RETURNING clause
    SELECT * INTO NEW FROM lootaura_v2.sales WHERE id = inserted_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sales_v2_insert_trigger
    INSTEAD OF INSERT ON public.sales_v2
    FOR EACH ROW
    EXECUTE FUNCTION public.sales_v2_insert();

-- Create INSTEAD OF UPDATE trigger function
CREATE OR REPLACE FUNCTION public.sales_v2_update()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE lootaura_v2.sales
    SET
        title = COALESCE(NEW.title, OLD.title),
        description = COALESCE(NEW.description, OLD.description),
        address = COALESCE(NEW.address, OLD.address),
        city = COALESCE(NEW.city, OLD.city),
        state = COALESCE(NEW.state, OLD.state),
        zip_code = COALESCE(NEW.zip_code, OLD.zip_code),
        lat = COALESCE(NEW.lat, OLD.lat),
        lng = COALESCE(NEW.lng, OLD.lng),
        date_start = COALESCE(NEW.date_start, OLD.date_start),
        time_start = COALESCE(NEW.time_start, OLD.time_start),
        date_end = COALESCE(NEW.date_end, OLD.date_end),
        time_end = COALESCE(NEW.time_end, OLD.time_end),
        status = COALESCE(NEW.status, OLD.status),
        is_featured = COALESCE(NEW.is_featured, OLD.is_featured),
        pricing_mode = COALESCE(NEW.pricing_mode, OLD.pricing_mode),
        privacy_mode = COALESCE(NEW.privacy_mode, OLD.privacy_mode),
        cover_image_url = NEW.cover_image_url,
        images = NEW.images,
        updated_at = NOW()
    WHERE id = OLD.id;
    
    -- Populate NEW with the updated row data for RETURNING clause
    SELECT * INTO NEW FROM lootaura_v2.sales WHERE id = OLD.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sales_v2_update_trigger
    INSTEAD OF UPDATE ON public.sales_v2
    FOR EACH ROW
    EXECUTE FUNCTION public.sales_v2_update();

-- Create INSTEAD OF DELETE trigger function
CREATE OR REPLACE FUNCTION public.sales_v2_delete()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM lootaura_v2.sales WHERE id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sales_v2_delete_trigger
    INSTEAD OF DELETE ON public.sales_v2
    FOR EACH ROW
    EXECUTE FUNCTION public.sales_v2_delete();

