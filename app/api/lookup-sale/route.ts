import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    const saleId = searchParams.get('saleId')
    
    if (!saleId) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Sale ID is required' 
      }, { status: 400 })
    }
    
    console.log(`[LOOKUP-SALE] Looking up sale ID: ${saleId}`)
    
    // Try different table names in order of preference
    const tableNames = ['sales_v2', 'sales', 'yard_sales']
    let sale: any = null
    let foundTable = ''
    
    for (const tableName of tableNames) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('id, title, address, city, state, address_key, owner_id')
          .eq('id', saleId)
          .single()
        
        if (!error && data) {
          sale = data
          foundTable = tableName
          console.log(`Found sale in table: ${tableName}`)
          break
        } else {
          console.log(`Table ${tableName} failed:`, error?.message)
        }
      } catch (err: any) {
        console.log(`Table ${tableName} error:`, err.message)
      }
    }
    
    if (!sale) {
      return NextResponse.json({ 
        ok: false, 
        error: `Sale not found in any accessible table. Tried: ${tableNames.join(', ')}` 
      }, { status: 404 })
    }
    
    // Compute review_key
    const reviewKey = `${sale.address_key}|${sale.owner_id}`
    
    // Count reviews for this review_key
    const { count: reviewCount, error: countError } = await supabase
      .from('reviews_v2')
      .select('*', { count: 'exact', head: true })
      .eq('review_key', reviewKey)
    
    if (countError) {
      console.log('Error counting reviews:', countError.message)
    }
    
    return NextResponse.json({
      ok: true,
      sale: {
        id: sale.id,
        title: sale.title,
        address: sale.address,
        city: sale.city,
        state: sale.state,
        address_key: sale.address_key,
        owner_id: sale.owner_id
      },
      review_key: reviewKey,
      review_count: reviewCount || 0,
      found_in_table: foundTable
    })
    
  } catch (error: any) {
    console.error('Lookup sale error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
