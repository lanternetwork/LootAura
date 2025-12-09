-- Add account lock fields to profiles table
-- Allows admins to lock user accounts to prevent write actions

-- Check if columns already exist before adding
DO $$
BEGIN
  -- Add is_locked field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'profiles' 
    AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE lootaura_v2.profiles 
      ADD COLUMN is_locked boolean NOT NULL DEFAULT false;
  END IF;

  -- Add locked_at field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'profiles' 
    AND column_name = 'locked_at'
  ) THEN
    ALTER TABLE lootaura_v2.profiles 
      ADD COLUMN locked_at timestamptz NULL;
  END IF;

  -- Add locked_by field (can be UUID of admin profile or text identifier)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'profiles' 
    AND column_name = 'locked_by'
  ) THEN
    ALTER TABLE lootaura_v2.profiles 
      ADD COLUMN locked_by text NULL; -- Store admin email or identifier
  END IF;

  -- Add lock_reason field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'lootaura_v2' 
    AND table_name = 'profiles' 
    AND column_name = 'lock_reason'
  ) THEN
    ALTER TABLE lootaura_v2.profiles 
      ADD COLUMN lock_reason text NULL;
  END IF;
END $$;

-- Index for efficient queries of locked accounts
CREATE INDEX IF NOT EXISTS idx_profiles_is_locked 
  ON lootaura_v2.profiles(is_locked)
  WHERE is_locked = true;

-- Add comments
COMMENT ON COLUMN lootaura_v2.profiles.is_locked IS 
  'Whether the account is locked. Locked users can read but cannot perform write actions.';

COMMENT ON COLUMN lootaura_v2.profiles.locked_at IS 
  'Timestamp when the account was locked.';

COMMENT ON COLUMN lootaura_v2.profiles.locked_by IS 
  'Admin identifier (email or text) who locked the account.';

COMMENT ON COLUMN lootaura_v2.profiles.lock_reason IS 
  'Reason for locking the account (internal code or free text).';

-- Note: RLS policies remain unchanged - owners can still read their own profile even if locked
-- Admins will use service role to update lock fields

