-- Check tables in both schemas
SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public', 'lootaura_v2') ORDER BY schemaname, tablename;

-- Check RLS status on key tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname IN ('public', 'lootaura_v2')
AND tablename IN ('profiles', 'sales', 'items', 'favorites', 'reviews', 'zipcodes')
ORDER BY schemaname, tablename;