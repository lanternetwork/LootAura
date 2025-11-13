-- Add image_url column to items_v2 view
-- The base table has image_url, but the view was missing it
-- This migration adds image_url to the existing view definition

-- First, check what columns exist and recreate the view accordingly
-- We'll use a DO block to conditionally include columns

DO $$
DECLARE
    has_category boolean;
    has_condition boolean;
    has_images boolean;
    has_is_sold boolean;
    has_updated_at boolean;
    view_sql text;
BEGIN
    -- Check which optional columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'items' 
        AND column_name = 'category'
    ) INTO has_category;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'items' 
        AND column_name = 'condition'
    ) INTO has_condition;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'items' 
        AND column_name = 'images'
    ) INTO has_images;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'items' 
        AND column_name = 'is_sold'
    ) INTO has_is_sold;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'items' 
        AND column_name = 'updated_at'
    ) INTO has_updated_at;
    
    -- Build the view SQL dynamically
    view_sql := 'CREATE VIEW public.items_v2 AS SELECT id, created_at, sale_id, name, description, price, image_url';
    
    IF has_category THEN
        view_sql := view_sql || ', category';
    END IF;
    
    IF has_condition THEN
        view_sql := view_sql || ', condition';
    END IF;
    
    IF has_images THEN
        view_sql := view_sql || ', images';
    END IF;
    
    IF has_is_sold THEN
        view_sql := view_sql || ', is_sold';
    END IF;
    
    IF has_updated_at THEN
        view_sql := view_sql || ', updated_at';
    END IF;
    
    view_sql := view_sql || ' FROM lootaura_v2.items';
    
    -- Drop and recreate the view
    DROP VIEW IF EXISTS public.items_v2 CASCADE;
    EXECUTE view_sql;
    
    -- Grant permissions
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;
END $$;

