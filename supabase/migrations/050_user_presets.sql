-- Create user_presets table for saved search presets
CREATE TABLE IF NOT EXISTS user_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  state_json JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_presets_user_id ON user_presets(user_id);

-- Create index for default preset lookups
CREATE INDEX IF NOT EXISTS idx_user_presets_user_default ON user_presets(user_id, is_default) WHERE is_default = TRUE;

-- Enable RLS
ALTER TABLE user_presets ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own presets
CREATE POLICY "Users can view their own presets" ON user_presets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own presets" ON user_presets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own presets" ON user_presets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own presets" ON user_presets
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_user_presets_updated_at
  BEFORE UPDATE ON user_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_user_presets_updated_at();
