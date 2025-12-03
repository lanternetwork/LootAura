-- Add start_soon_notified_at column to favorites table
-- This column tracks when a "favorite sale starting soon" email has been sent
-- to prevent duplicate notifications for the same favorite

ALTER TABLE lootaura_v2.favorites
  ADD COLUMN IF NOT EXISTS start_soon_notified_at timestamptz NULL;

COMMENT ON COLUMN lootaura_v2.favorites.start_soon_notified_at IS 
  'Set when a "favorite sale starting soon" email has been sent for this favorite, to prevent duplicate notifications.';

-- Add index to support job scanning queries
CREATE INDEX IF NOT EXISTS idx_favorites_start_soon_notified 
  ON lootaura_v2.favorites(start_soon_notified_at);

