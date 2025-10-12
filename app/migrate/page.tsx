'use client'
import { useState } from 'react'

export default function MigratePage() {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const runMigration = async () => {
    setIsRunning(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Database Migration
        </h1>

        <div className="space-y-8">
          {/* Migration Test */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Test Migration Access</h2>
            <p className="text-gray-600 mb-4">
              This will test if we can access the database and determine what migration steps are needed.
            </p>
            
            <button
              onClick={runMigration}
              disabled={isRunning}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? 'Testing...' : 'Test Migration Access'}
            </button>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {result && (
              <div className="mt-6 bg-green-50 border border-green-200 rounded-md p-4">
                <h3 className="font-medium text-green-800 mb-2">Migration Test Result</h3>
                <pre className="text-sm text-green-700 whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Manual Migration Instructions */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-6">
            <h3 className="font-medium text-yellow-800 mb-2">Manual Migration Instructions</h3>
            <div className="text-sm text-yellow-700 space-y-2">
              <p><strong>Step 1:</strong> Go to your Supabase dashboard</p>
              <p><strong>Step 2:</strong> Navigate to the SQL Editor</p>
              <p><strong>Step 3:</strong> Copy and paste the following SQL:</p>
            </div>
            
            <div className="mt-4 bg-gray-100 p-4 rounded border">
              <pre className="text-xs overflow-x-auto">
{`-- Simple dual-link review system migration
-- Run this in Supabase SQL editor

-- 1. Add address_key column to sales table
ALTER TABLE lootaura_v2.sales ADD COLUMN IF NOT EXISTS address_key TEXT;

-- 2. Create function to normalize address
CREATE OR REPLACE FUNCTION lootaura_v2.normalize_address(
    p_address TEXT,
    p_city TEXT,
    p_state TEXT,
    p_zip_code TEXT
) RETURNS TEXT AS $$
DECLARE
    normalized_address TEXT;
BEGIN
    -- Normalize address: lowercase, trim, remove extra spaces, remove unit numbers
    normalized_address := LOWER(TRIM(COALESCE(p_address, '')));
    
    -- Remove common unit indicators (apt, unit, #, etc.)
    normalized_address := REGEXP_REPLACE(normalized_address, '\\s+(apt|apartment|unit|#|suite|ste)\\s*[a-z0-9-]*', '', 'gi');
    
    -- Remove extra spaces and normalize
    normalized_address := REGEXP_REPLACE(normalized_address, '\\s+', ' ', 'g');
    normalized_address := TRIM(normalized_address);
    
    -- Combine with city, state, zip for unique key
    normalized_address := normalized_address || '|' || LOWER(TRIM(COALESCE(p_city, ''))) || '|' || UPPER(TRIM(COALESCE(p_state, ''))) || '|' || TRIM(COALESCE(p_zip_code, ''));
    
    RETURN normalized_address;
END;
$$ LANGUAGE plpgsql;

-- 3. Update existing sales with address_key
UPDATE lootaura_v2.sales 
SET address_key = lootaura_v2.normalize_address(address, city, state, zip_code)
WHERE address_key IS NULL;

-- 4. Add columns to reviews table
ALTER TABLE lootaura_v2.reviews 
ADD COLUMN IF NOT EXISTS review_key TEXT,
ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS address_key TEXT,
ADD COLUMN IF NOT EXISTS username_display TEXT,
ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE;

-- 5. Create function to compute review_key
CREATE OR REPLACE FUNCTION lootaura_v2.compute_review_key(
    p_address_key TEXT,
    p_seller_id UUID
) RETURNS TEXT AS $$
BEGIN
    RETURN p_address_key || '|' || p_seller_id::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS sales_address_key_idx ON lootaura_v2.sales (address_key);
CREATE INDEX IF NOT EXISTS reviews_review_key_idx ON lootaura_v2.reviews (review_key);
CREATE INDEX IF NOT EXISTS reviews_address_key_idx ON lootaura_v2.reviews (address_key);
CREATE INDEX IF NOT EXISTS reviews_seller_id_idx ON lootaura_v2.reviews (seller_id);

-- 7. Update public views to include new columns
DROP VIEW IF EXISTS public.sales_v2 CASCADE;
CREATE VIEW public.sales_v2 AS
SELECT 
    id, created_at, updated_at, owner_id, title, description, address, city, state, zip_code, address_key,
    lat, lng, geom, date_start, time_start, date_end, time_end, starts_at, status, is_featured
FROM lootaura_v2.sales;

DROP VIEW IF EXISTS public.reviews_v2 CASCADE;
CREATE VIEW public.reviews_v2 AS
SELECT 
    id, created_at, review_key, sale_id, user_id, seller_id, address_key, username_display, rating, comment
FROM lootaura_v2.reviews;

-- 8. Grant permissions on new views
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_v2 TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews_v2 TO anon, authenticated;`}
              </pre>
            </div>
            
            <p className="text-sm text-yellow-700 mt-4">
              <strong>Step 4:</strong> Execute the SQL and verify it runs without errors
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
