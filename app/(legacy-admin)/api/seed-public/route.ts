import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SEED_DATA } from '@/lib/admin/seedDataset'

export async function POST(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE

    if (!url || !serviceKey) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Missing Supabase configuration' 
      }, { status: 500 })
    }

    // Create admin client that bypasses RLS
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false }
    })

    console.log('🌱 Starting public database seed...')
    
    let inserted = 0
    let updated = 0
    let skipped = 0
    let itemsInserted = 0
    const errors: string[] = []

    for (const seed of SEED_DATA) {
      try {
        // Check if sale already exists
        const { data: existing } = await supabase
          .from('yard_sales')
          .select('id, tags')
          .eq('owner_id', seed.seller_id)
          .ilike('title', seed.title)
          .eq('start_at', seed.starts_at)
          .limit(1)
          .maybeSingle()

        if (existing) {
          // Always update existing sale with categories (force update)
          console.log(`🔄 Updating categories for existing: ${seed.title} -> ${JSON.stringify(seed.categories)}`)
          const { error: updateError } = await supabase
            .from('yard_sales')
            .update({ tags: seed.categories })
            .eq('id', existing.id)
          
          if (updateError) {
            console.log(`⚠️  Failed to update categories for ${seed.title}: ${updateError.message}`)
            errors.push(`Update failed for ${seed.title}: ${updateError.message}`)
          } else {
            console.log(`✅ Updated categories for existing: ${seed.title}`)
            updated++
          }
          skipped++
          continue
        }

        // Insert sale
        const { data: sale, error: saleError } = await supabase
          .from('yard_sales')
          .insert({
            owner_id: seed.seller_id,
            title: seed.title,
            description: null,
            address: seed.address || null,
            city: seed.city,
            state: seed.state,
            zip: null,
            lat: seed.lat,
            lng: seed.lng,
            start_at: seed.starts_at,
            end_at: seed.ends_at,
            tags: seed.categories, // Add categories as tags
            status: 'active',
            source: 'manual',
          })
          .select('id')
          .single()

        if (saleError) {
          throw new Error(`Sale insert failed: ${saleError.message}`)
        }

        inserted++
        console.log(`✅ Inserted sale: ${seed.title}`)

        // Insert items
        for (const item of seed.items) {
          const { error: itemError } = await supabase
            .from('sale_items')
            .insert({
              sale_id: sale.id,
              name: item.name,
              category: null,
              condition: null,
              price: item.price,
              photo: null,
              purchased: false,
            })

          if (itemError) {
            console.error(`❌ Item insert failed: ${itemError.message}`)
            errors.push(`Item "${item.name}" failed: ${itemError.message}`)
          } else {
            itemsInserted++
          }
        }

      } catch (error: any) {
        console.error(`❌ Error processing ${seed.title}:`, error.message)
        errors.push(`${seed.title}: ${error.message}`)
      }
    }

    console.log('\n📊 Seed Results:')
    console.log(`✅ Sales inserted: ${inserted}`)
    console.log(`⏭️  Sales skipped: ${skipped}`)
    console.log(`📦 Items inserted: ${itemsInserted}`)
    
    if (errors.length > 0) {
      console.log(`❌ Errors: ${errors.length}`)
      errors.forEach(error => console.log(`   - ${error}`))
    }

    return NextResponse.json({
      ok: true,
      inserted,
      updated,
      skipped,
      itemsInserted,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: any) {
    console.error('❌ Seed failed:', error.message)
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 })
  }
}
