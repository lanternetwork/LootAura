import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[MANUAL-MIGRATION] Starting dual-link reviews system migration...')
    
    // Step 1: Add address_key column to sales table
    console.log('[MANUAL-MIGRATION] Step 1: Adding address_key column...')
    const { error: addColumnError } = await supabase.rpc('exec', {
      sql: 'ALTER TABLE lootaura_v2.sales ADD COLUMN IF NOT EXISTS address_key TEXT;'
    })
    
    if (addColumnError) {
      console.log('[MANUAL-MIGRATION] Error adding address_key column:', addColumnError.message)
    }
    
    // Step 2: Create normalize_address function
    console.log('[MANUAL-MIGRATION] Step 2: Creating normalize_address function...')
    const normalizeFunction = `
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
    `
    
    const { error: functionError } = await supabase.rpc('exec', { sql: normalizeFunction })
    
    if (functionError) {
      console.log('[MANUAL-MIGRATION] Error creating normalize_address function:', functionError.message)
    }
    
    // Step 3: Update existing sales with address_key
    console.log('[MANUAL-MIGRATION] Step 3: Updating existing sales with address_key...')
    const { error: updateError } = await supabase.rpc('exec', {
      sql: `UPDATE lootaura_v2.sales 
            SET address_key = lootaura_v2.normalize_address(address, city, state, zip_code)
            WHERE address_key IS NULL;`
    })
    
    if (updateError) {
      console.log('[MANUAL-MIGRATION] Error updating existing sales:', updateError.message)
    }
    
    // Step 4: Add columns to reviews table
    console.log('[MANUAL-MIGRATION] Step 4: Adding columns to reviews table...')
    const { error: reviewsError } = await supabase.rpc('exec', {
      sql: `ALTER TABLE lootaura_v2.reviews 
            ADD COLUMN IF NOT EXISTS review_key TEXT,
            ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS address_key TEXT,
            ADD COLUMN IF NOT EXISTS username_display TEXT,
            ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE;`
    })
    
    if (reviewsError) {
      console.log('[MANUAL-MIGRATION] Error adding columns to reviews:', reviewsError.message)
    }
    
    // Step 5: Create indexes
    console.log('[MANUAL-MIGRATION] Step 5: Creating indexes...')
    const { error: indexError } = await supabase.rpc('exec', {
      sql: `CREATE INDEX IF NOT EXISTS sales_address_key_idx ON lootaura_v2.sales (address_key);
            CREATE INDEX IF NOT EXISTS reviews_review_key_idx ON lootaura_v2.reviews (review_key);
            CREATE INDEX IF NOT EXISTS reviews_address_key_idx ON lootaura_v2.reviews (address_key);
            CREATE INDEX IF NOT EXISTS reviews_seller_id_idx ON lootaura_v2.reviews (seller_id);`
    })
    
    if (indexError) {
      console.log('[MANUAL-MIGRATION] Error creating indexes:', indexError.message)
    }
    
    // Step 6: Update public views
    console.log('[MANUAL-MIGRATION] Step 6: Updating public views...')
    const { error: viewError } = await supabase.rpc('exec', {
      sql: `DROP VIEW IF EXISTS public.sales_v2 CASCADE;
            CREATE VIEW public.sales_v2 AS
            SELECT 
                id, created_at, updated_at, owner_id, title, description, address, city, state, zip_code, address_key,
                lat, lng, geom, date_start, time_start, date_end, time_end, starts_at, status, is_featured
            FROM lootaura_v2.sales;
            
            DROP VIEW IF EXISTS public.reviews_v2 CASCADE;
            CREATE VIEW public.reviews_v2 AS
            SELECT 
                id, created_at, review_key, sale_id, user_id, seller_id, address_key, username_display, rating, comment
            FROM lootaura_v2.reviews;`
    })
    
    if (viewError) {
      console.log('[MANUAL-MIGRATION] Error updating views:', viewError.message)
    }
    
    // Test the migration
    console.log('[MANUAL-MIGRATION] Testing migration...')
    const { data: testData, error: testError } = await supabase
      .from('sales_v2')
      .select('id, address_key')
      .limit(1)
    
    const migrationSuccess = !testError && testData !== null
    
    return NextResponse.json({
      ok: migrationSuccess,
      message: migrationSuccess ? 'Migration completed successfully' : 'Migration failed',
      test_result: {
        address_key_exists: !testError,
        test_error: testError?.message,
        sample_data: testData
      }
    })
    
  } catch (error: any) {
    console.error('Manual migration error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
