-- SEO_METRO_PAGE_UX_V1.1: display payload columns for metro landing page cards.

ALTER TABLE lootaura_v2.seo_metro_inventory
  ADD COLUMN IF NOT EXISTS cover_image_url text NULL,
  ADD COLUMN IF NOT EXISTS address text NULL;

COMMENT ON COLUMN lootaura_v2.seo_metro_inventory.cover_image_url IS
  'Snapshot cover image URL for SEO metro listing cards (cron-populated).';

COMMENT ON COLUMN lootaura_v2.seo_metro_inventory.address IS
  'Snapshot display address for SEO metro listing cards (cron-populated).';
