-- Fix RLS policies for sales access through public views
-- Ensure anon and authenticated roles can read sales data through public.sales_v2

-- First, let's check if the current policy allows public access
-- The existing policy "Sales are viewable by everyone." should work, but let's ensure it's correct

-- Drop and recreate the policy to ensure it's properly configured
DROP POLICY IF EXISTS "Sales are viewable by everyone." ON lootaura_v2.sales;

-- Create a more explicit policy that allows public read access
CREATE POLICY "public_read_sales" ON lootaura_v2.sales
FOR SELECT
TO anon, authenticated
USING (
  status IN ('published', 'active')
  AND lat IS NOT NULL 
  AND lng IS NOT NULL
);

-- Ensure the policy is enabled
ALTER TABLE lootaura_v2.sales ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions on the underlying table
GRANT SELECT ON lootaura_v2.sales TO anon, authenticated;

-- Verify the setup works
DO $$
DECLARE
    sales_count integer;
BEGIN
    -- Test if we can read from the view
    SELECT COUNT(*) INTO sales_count FROM public.sales_v2;
    
    RAISE NOTICE 'Public sales_v2 view accessible: % rows', sales_count;
    
    -- Test if we can read from the underlying table with RLS
    SELECT COUNT(*) INTO sales_count FROM lootaura_v2.sales;
    
    RAISE NOTICE 'Underlying lootaura_v2.sales accessible: % rows', sales_count;
END $$;
