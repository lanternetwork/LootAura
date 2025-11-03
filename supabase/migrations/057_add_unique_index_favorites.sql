-- Ensure one favorite per (user_id, sale_id)
CREATE UNIQUE INDEX IF NOT EXISTS ux_favorites_user_sale
  ON lootaura_v2.favorites (user_id, sale_id);


