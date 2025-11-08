-- Fix owner_stats trigger function to use SECURITY DEFINER
-- This allows the trigger to insert/update owner_stats even when RLS is enabled

-- Drop and recreate the function with SECURITY DEFINER
DROP FUNCTION IF EXISTS lootaura_v2.bump_owner_sales_on_insert() CASCADE;

CREATE OR REPLACE FUNCTION lootaura_v2.bump_owner_sales_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = lootaura_v2, public
AS $$
BEGIN
  INSERT INTO lootaura_v2.owner_stats (user_id, total_sales, last_sale_at)
  VALUES (new.owner_id, 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET total_sales = lootaura_v2.owner_stats.total_sales + 1,
        last_sale_at = now(),
        updated_at = now();
  RETURN new;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_bump_owner_sales_on_insert ON lootaura_v2.sales;

CREATE TRIGGER trg_bump_owner_sales_on_insert
AFTER INSERT ON lootaura_v2.sales
FOR EACH ROW
EXECUTE FUNCTION lootaura_v2.bump_owner_sales_on_insert();

