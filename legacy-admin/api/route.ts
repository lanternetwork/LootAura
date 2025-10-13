import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { SEED_DATA } from '@/lib/admin/seedDataset'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    
    console.log('🔧 Starting category fix process...')
    
    let updated = 0
    let errors: string[] = []
    
    // Get all sales that need category updates
    const { data: allSales, error: fetchError } = await supabase
      .from('yard_sales')
      .select('id, title, tags')
      .eq('status', 'active')
    
    if (fetchError) {
      throw new Error(`Failed to fetch sales: ${fetchError.message}`)
    }
    
    console.log(`📊 Found ${allSales?.length || 0} sales to check`)
    
    // Create a mapping of titles to categories from seed data
    const titleToCategories = new Map<string, string[]>()
    SEED_DATA.forEach(seed => {
      titleToCategories.set(seed.title, seed.categories)
    })
    
    // Update each sale with its categories
    for (const sale of allSales || []) {
      const categories = titleToCategories.get(sale.title)
      
      if (categories && categories.length > 0) {
        // Check if categories are already correct
        const currentTags = sale.tags || []
        const needsUpdate = JSON.stringify(currentTags.sort()) !== JSON.stringify(categories.sort())
        
        if (needsUpdate) {
          const { error: updateError } = await supabase
            .from('yard_sales')
            .update({ tags: categories })
            .eq('id', sale.id)
          
          if (updateError) {
            console.log(`⚠️  Failed to update ${sale.title}: ${updateError.message}`)
            errors.push(`Failed to update ${sale.title}: ${updateError.message}`)
          } else {
            console.log(`✅ Updated categories for: ${sale.title} -> ${JSON.stringify(categories)}`)
            updated++
          }
        } else {
          console.log(`✅ ${sale.title} already has correct categories`)
        }
      } else {
        console.log(`⚠️  No categories found for: ${sale.title}`)
      }
    }
    
    console.log(`🎯 Category fix complete: ${updated} updated, ${errors.length} errors`)
    
    return NextResponse.json({
      ok: true,
      updated,
      totalSales: allSales?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
      message: `Updated ${updated} sales with categories`
    })
    
  } catch (error: any) {
    console.error('❌ Category fix failed:', error.message)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
