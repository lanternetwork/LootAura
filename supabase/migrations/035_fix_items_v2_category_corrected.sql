-- Fix items_v2 view to include category column
-- This migration first checks the actual schema and then creates the appropriate view

-- First, let's check what columns actually exist in lootaura_v2.items
DO $$
DECLARE
    has_category boolean;
    has_categories boolean;
    column_list text;
BEGIN
    -- Check if 'category' column exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'items' 
        AND column_name = 'category'
    ) INTO has_category;
    
    -- Check if 'categories' column exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'lootaura_v2' 
        AND table_name = 'items' 
        AND column_name = 'categories'
    ) INTO has_categories;
    
    -- Get list of all columns for debugging
    SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
    INTO column_list
    FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'items';
    
    RAISE NOTICE 'Available columns in lootaura_v2.items: %', column_list;
    RAISE NOTICE 'Has category column: %', has_category;
    RAISE NOTICE 'Has categories column: %', has_categories;
    
    -- If neither category column exists, we need to add one
    IF NOT has_category AND NOT has_categories THEN
        RAISE NOTICE 'No category column found. Adding category column to lootaura_v2.items...';
        
        -- Add category column to the items table
        ALTER TABLE lootaura_v2.items 
        ADD COLUMN IF NOT EXISTS category TEXT;
        
        -- Set a default value for existing rows
        UPDATE lootaura_v2.items 
        SET category = 'general' 
        WHERE category IS NULL;
        
        RAISE NOTICE 'Category column added successfully';
    END IF;
END $$;

-- Now drop and recreate the items_v2 view with the category column
DROP VIEW IF EXISTS public.items_v2 CASCADE;

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

-- Grant permissions on the updated view
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items_v2 TO anon, authenticated;

-- Verify the view has the category column
DO $$
DECLARE
    column_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'items_v2' 
        AND column_name = 'category'
    ) INTO column_exists;
    
    IF column_exists THEN
        RAISE NOTICE 'items_v2 view successfully updated with category column';
    ELSE
        RAISE EXCEPTION 'items_v2 view update failed - category column not found';
    END IF;
END $$;
