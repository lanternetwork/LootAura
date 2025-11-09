-- Add INSTEAD OF triggers to items_v2 view to enable INSERT, UPDATE, DELETE operations
-- PostgreSQL views are read-only by default and need INSTEAD OF triggers for writes
-- This is required because PostgREST can only access the 'public' schema, not 'lootaura_v2'

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS items_v2_insert_trigger ON public.items_v2;
DROP TRIGGER IF EXISTS items_v2_update_trigger ON public.items_v2;
DROP TRIGGER IF EXISTS items_v2_delete_trigger ON public.items_v2;

-- Create INSTEAD OF INSERT trigger function
CREATE OR REPLACE FUNCTION public.items_v2_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO lootaura_v2.items (
        sale_id,
        name,
        description,
        price,
        category,
        condition,
        images,
        is_sold,
        updated_at,
        image_url
    ) VALUES (
        NEW.sale_id,
        NEW.name,
        NEW.description,
        NEW.price,
        NEW.category,
        NEW.condition,
        NEW.images,
        COALESCE(NEW.is_sold, FALSE),
        COALESCE(NEW.updated_at, NOW()),
        -- If images array exists, use first element for image_url
        CASE 
            WHEN NEW.images IS NOT NULL AND array_length(NEW.images, 1) > 0 THEN NEW.images[1]
            ELSE NULL
        END
    )
    RETURNING * INTO NEW;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER items_v2_insert_trigger
    INSTEAD OF INSERT ON public.items_v2
    FOR EACH ROW
    EXECUTE FUNCTION public.items_v2_insert();

-- Create INSTEAD OF UPDATE trigger function
CREATE OR REPLACE FUNCTION public.items_v2_update()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE lootaura_v2.items SET
        sale_id = COALESCE(NEW.sale_id, OLD.sale_id),
        name = COALESCE(NEW.name, OLD.name),
        description = NEW.description,
        price = NEW.price,
        category = NEW.category,
        condition = NEW.condition,
        images = NEW.images,
        is_sold = COALESCE(NEW.is_sold, OLD.is_sold),
        updated_at = NOW(),
        image_url = CASE 
            WHEN NEW.images IS NOT NULL AND array_length(NEW.images, 1) > 0 THEN NEW.images[1]
            ELSE OLD.image_url
        END
    WHERE id = OLD.id
    RETURNING * INTO NEW;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER items_v2_update_trigger
    INSTEAD OF UPDATE ON public.items_v2
    FOR EACH ROW
    EXECUTE FUNCTION public.items_v2_update();

-- Create INSTEAD OF DELETE trigger function
CREATE OR REPLACE FUNCTION public.items_v2_delete()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM lootaura_v2.items WHERE id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER items_v2_delete_trigger
    INSTEAD OF DELETE ON public.items_v2
    FOR EACH ROW
    EXECUTE FUNCTION public.items_v2_delete();

-- Add comments for documentation
COMMENT ON FUNCTION public.items_v2_insert() IS 'INSTEAD OF trigger for INSERT on items_v2 view - maps images array to image_url';
COMMENT ON FUNCTION public.items_v2_update() IS 'INSTEAD OF trigger for UPDATE on items_v2 view';
COMMENT ON FUNCTION public.items_v2_delete() IS 'INSTEAD OF trigger for DELETE on items_v2 view';

