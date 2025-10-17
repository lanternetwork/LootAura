-- Storage Policy Tightening Migration
-- This migration tightens storage bucket policies to block direct client writes
-- and only allow server-signed URL uploads

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

-- Allow public read access to images (for displaying uploaded images)
CREATE POLICY "images_public_read" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'images');

-- Block all direct client writes to storage
-- Only server-signed URLs (created with service role) can upload
CREATE POLICY "images_server_write_only" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'images' AND
        -- This policy will be bypassed by service role signed URLs
        -- but will block direct client uploads
        false
    );

-- Allow server-signed URL uploads (this is handled by Supabase's signed URL mechanism)
-- The signed URL contains the necessary authentication to bypass RLS
-- No additional policy needed for this

-- Block direct client updates and deletes
CREATE POLICY "images_no_client_updates" ON storage.objects
    FOR UPDATE
    USING (false);

CREATE POLICY "images_no_client_deletes" ON storage.objects
    FOR DELETE
    USING (false);

-- Add comment for rollback reference
COMMENT ON POLICY "images_public_read" ON storage.objects IS 'Allows public read access to images for display';
COMMENT ON POLICY "images_server_write_only" ON storage.objects IS 'Blocks direct client writes, only server-signed URLs allowed';
COMMENT ON POLICY "images_no_client_updates" ON storage.objects IS 'Blocks direct client updates to images';
COMMENT ON POLICY "images_no_client_deletes" ON storage.objects IS 'Blocks direct client deletes of images';

-- Verify bucket exists and has proper configuration
DO $$
BEGIN
    -- Check if images bucket exists
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'images') THEN
        -- Create images bucket if it doesn't exist
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'images',
            'images',
            true, -- Public read access
            5242880, -- 5MB file size limit
            ARRAY['image/jpeg', 'image/png', 'image/webp'] -- Allowed MIME types
        );
    ELSE
        -- Update existing bucket configuration
        UPDATE storage.buckets 
        SET 
            public = true,
            file_size_limit = 5242880,
            allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
        WHERE id = 'images';
    END IF;
END $$;
