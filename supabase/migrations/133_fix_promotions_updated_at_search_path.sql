-- Fix Performance Advisor warning: function_search_path_mutable
-- Function: lootaura_v2.update_promotions_updated_at
-- Issue: function does not explicitly set search_path
--
-- This migration hardens the function by explicitly setting a safe, immutable search_path.
-- No runtime behavior changes - only adds explicit search_path setting.

CREATE OR REPLACE FUNCTION lootaura_v2.update_promotions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = lootaura_v2, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Verify the trigger still exists and references the updated function
-- (No changes needed to the trigger itself)
