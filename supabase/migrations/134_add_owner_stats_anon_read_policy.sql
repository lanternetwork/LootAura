-- Add RLS policy to allow anonymous users to read owner_stats
-- This fixes the issue where anonymous users cannot see seller details
-- (member since, sales posted) on sale detail pages

-- Allow anonymous users to read owner stats (same scope as authenticated users)
CREATE POLICY "owner_stats_read_all_anon"
ON lootaura_v2.owner_stats
FOR SELECT
TO anon
USING (true);

-- Add comment for documentation
COMMENT ON POLICY "owner_stats_read_all_anon" ON lootaura_v2.owner_stats IS 
    'Allows anonymous users to read all owner stats. Required for public sale detail pages to display seller information (member since, sales posted). Matches the scope of owner_stats_read_all_auth policy.';
