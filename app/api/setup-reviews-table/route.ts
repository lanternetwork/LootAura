import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('[SETUP-REVIEWS] Starting reviews table setup...')
    
    // 1. Create reviews table if it doesn't exist
    const { error: createTableError } = await supabase.rpc('execute_sql', {
      sql_statement: `
        CREATE TABLE IF NOT EXISTS lootaura_v2.reviews (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
          rating INTEGER CHECK (rating >= 1 AND rating <= 5),
          comment TEXT,
          sale_id UUID REFERENCES lootaura_v2.sales(id) ON DELETE CASCADE
        );
      `
    })
    
    if (createTableError) {
      console.log('Error creating table:', createTableError.message)
    } else {
      console.log('Reviews table created/verified')
    }
    
    // 2. Add new columns for dual-link system
    const { error: addColumnsError } = await supabase.rpc('execute_sql', {
      sql_statement: `
        ALTER TABLE lootaura_v2.reviews 
        ADD COLUMN IF NOT EXISTS review_key TEXT,
        ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS address_key TEXT,
        ADD COLUMN IF NOT EXISTS username_display TEXT;
      `
    })
    
    if (addColumnsError) {
      console.log('Error adding columns:', addColumnsError.message)
    } else {
      console.log('Review columns added/verified')
    }
    
    // 3. Create indexes
    const { error: indexesError } = await supabase.rpc('execute_sql', {
      sql_statement: `
        CREATE INDEX IF NOT EXISTS reviews_review_key_idx ON lootaura_v2.reviews (review_key);
        CREATE INDEX IF NOT EXISTS reviews_address_key_idx ON lootaura_v2.reviews (address_key);
        CREATE INDEX IF NOT EXISTS reviews_seller_id_idx ON lootaura_v2.reviews (seller_id);
        CREATE INDEX IF NOT EXISTS reviews_sale_id_idx ON lootaura_v2.reviews (sale_id);
      `
    })
    
    if (indexesError) {
      console.log('Error creating indexes:', indexesError.message)
    } else {
      console.log('Review indexes created/verified')
    }
    
    // 4. Update public views
    const { error: viewsError } = await supabase.rpc('execute_sql', {
      sql_statement: `
        DROP VIEW IF EXISTS public.reviews_v2 CASCADE;
        CREATE VIEW public.reviews_v2 AS
        SELECT 
          id, created_at, review_key, sale_id, user_id, seller_id, address_key, username_display, rating, comment
        FROM lootaura_v2.reviews;
        
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews_v2 TO anon, authenticated;
      `
    })
    
    if (viewsError) {
      console.log('Error updating views:', viewsError.message)
    } else {
      console.log('Review views updated/verified')
    }
    
    // 5. Test the setup
    const { data: testData, error: testError } = await supabase
      .from('reviews_v2')
      .select('*')
      .limit(1)
    
    if (testError) {
      console.log('Error testing reviews_v2 view:', testError.message)
    } else {
      console.log('Reviews_v2 view is accessible')
    }
    
    return NextResponse.json({
      ok: true,
      message: 'Reviews table setup completed successfully',
      test_access: testError ? false : true
    })
    
  } catch (error: any) {
    console.error('Setup reviews table error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
