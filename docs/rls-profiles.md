# RLS Policies for Profiles Table

## Overview
This document outlines the Row Level Security (RLS) policies for the `profiles` table to ensure users can only access their own profile data.

## Table Structure
```sql
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## RLS Policies to Implement

### 1. Enable RLS
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

### 2. Select Policy (Read Own Profile Only)
```sql
CREATE POLICY "Users can read their own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);
```

### 3. Insert Policy (Create Own Profile Only)
```sql
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### 4. Update Policy (Update Own Profile Only)
```sql
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);
```

### 5. Delete Policy (Delete Own Profile Only)
```sql
CREATE POLICY "Users can delete their own profile" ON profiles
  FOR DELETE USING (auth.uid() = user_id);
```

## Security Considerations

### Privacy-First Approach
- **No Public Reads**: Profiles are not publicly accessible by default
- **Self-Only Access**: Users can only access their own profile
- **No Cross-User Access**: Users cannot read other users' profiles

### Authentication Requirements
- All operations require authentication (`auth.uid()` must be present)
- Unauthenticated requests are automatically denied
- Session validation is handled by Supabase Auth

### Data Validation
- `user_id` must match the authenticated user's ID
- `display_name` is required and cannot be empty
- `avatar_url` is optional but must be a valid URL if provided

## Testing RLS Policies

### Unit Tests
- Test that users can read their own profile
- Test that users cannot read other users' profiles
- Test that users can create their own profile
- Test that users cannot create profiles for other users
- Test that users can update their own profile
- Test that users cannot update other users' profiles
- Test that users can delete their own profile
- Test that users cannot delete other users' profiles

### Integration Tests
- Test unauthenticated access is denied
- Test authenticated access works correctly
- Test profile creation on first login
- Test profile updates work correctly
- Test profile deletion works correctly

## Performance Considerations

### Index Usage
- `user_id` is the primary key and automatically indexed
- RLS policies use `auth.uid()` which is fast
- No additional indexes needed for RLS performance

### Query Optimization
- Use `SELECT` with specific columns to reduce data transfer
- Use `UPSERT` for idempotent profile creation
- Avoid `SELECT *` to reduce payload size

## Migration Strategy

### 1. Create Table
```sql
-- Create profiles table with RLS
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

### 2. Create Policies
```sql
-- Add all RLS policies as outlined above
```

### 3. Test Policies
```sql
-- Test with different user contexts
-- Verify policies work as expected
```

### 4. Grant Permissions
```sql
-- Grant appropriate permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
```

## Monitoring and Maintenance

### Policy Performance
- Monitor query execution plans
- Check for policy-related performance issues
- Verify RLS policies are being used correctly

### Security Audits
- Regular review of RLS policies
- Test for policy bypasses
- Verify no data leakage

### Documentation Updates
- Keep policies documented
- Update when schema changes
- Maintain testing procedures
