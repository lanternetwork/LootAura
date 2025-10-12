-- Check current database state
-- This will show tables in both public and lootaura_v2 schemas

-- Check public schema tables
SELECT 
    schemaname,
    tablename,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE schemaname IN ('public', 'lootaura_v2')
ORDER BY schemaname, tablename;

-- Check RLS status on key tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname IN ('public', 'lootaura_v2')
AND tablename IN ('profiles', 'sales', 'items', 'favorites', 'reviews', 'zipcodes')
ORDER BY schemaname, tablename;

-- Check if sales_v2 view exists
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'sales_v2';
