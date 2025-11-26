-- 090_legacy_sale_items_rename.sql
-- Conservatively mark v1 items table as legacy without dropping data.
-- This avoids impacting any external consumers while clearly signaling
-- that the main application now uses lootaura_v2.items instead.

DO $$
BEGIN
  -- Only rename if the legacy name does not already exist and the original does.
  IF to_regclass('public.sale_items_legacy') IS NULL
     AND to_regclass('public.sale_items') IS NOT NULL THEN
    ALTER TABLE public.sale_items RENAME TO sale_items_legacy;

    COMMENT ON TABLE public.sale_items_legacy IS
      'Deprecated v1 items table retained for historical data; superseded by lootaura_v2.items and public.items_v2. No direct references remain in the LootAura app code.';
  END IF;
END
$$;


