-- 148_add_is_current_user_admin_and_fix_promotions_policy.sql
-- Introduce a SECURITY DEFINER helper to check admin status via auth.users
-- without granting SELECT on auth.users to the authenticated role.
-- Update promotions_admin_select policy on lootaura_v2.promotions to use this helper.

-- Helper: returns true if the current auth.uid() is in app.admin_emails
CREATE OR REPLACE FUNCTION lootaura_v2.is_current_user_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, pg_catalog
AS $$
DECLARE
  v_email text;
  v_admin_emails text[];
BEGIN
  -- Fetch current user's email from auth.users
  SELECT email
  INTO v_email
  FROM auth.users
  WHERE id = auth.uid();

  IF v_email IS NULL THEN
    RETURN false;
  END IF;

  -- Read admin emails from GUC and split into an array
  v_admin_emails :=
    string_to_array(current_setting('app.admin_emails', true), ',');

  IF v_admin_emails IS NULL THEN
    RETURN false;
  END IF;

  RETURN lower(v_email) = ANY (
    SELECT trim(lower(e))
    FROM unnest(v_admin_emails) AS e
  );
END;
$$;

-- Lock down function execution: no implicit PUBLIC or broad EXECUTE
REVOKE ALL ON FUNCTION lootaura_v2.is_current_user_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION lootaura_v2.is_current_user_admin() FROM authenticated;
GRANT EXECUTE ON FUNCTION lootaura_v2.is_current_user_admin() TO authenticated;

-- Replace promotions_admin_select to use the helper
DROP POLICY IF EXISTS promotions_admin_select ON lootaura_v2.promotions;

CREATE POLICY promotions_admin_select ON lootaura_v2.promotions
  FOR SELECT
  TO authenticated
  USING (lootaura_v2.is_current_user_admin());

