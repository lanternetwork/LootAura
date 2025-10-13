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
      auth: { persistSession: false },
      db: { schema: 'lootaura_v2' }
    })

    console.log('🌱 Starting direct database seed...')
    
    let inserted = 0
    let skipped = 0
    let itemsInserted = 0
    const errors: string[] = []

    for (const seed of SEED_DATA) {
      try {
        // Check if sale already exists
        const { data: existing } = await supabase
          .from('sales')
          .select('id')
          .eq('owner_id', seed.seller_id)
          .ilike('title', seed.title)
          .eq('date_start', seed.starts_at.split('T')[0])
          .limit(1)
          .maybeSingle()

        if (existing) {
          skipped++
          console.log(`⏭️  Skipped existing: ${seed.title}`)
          continue
        }

        // Insert sale
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .insert({
            owner_id: seed.seller_id,
            title: seed.title,
            description: null,
            address: seed.address || null,
            city: seed.city,
            state: seed.state,
            zip_code: null,
            lat: seed.lat,
            lng: seed.lng,
            date_start: seed.starts_at.split('T')[0],
            time_start: seed.starts_at.split('T')[1]?.slice(0,5) || '08:00',
            date_end: seed.ends_at.split('T')[0],
            time_end: seed.ends_at.split('T')[1]?.slice(0,5) || '12:00',
            status: 'published',
            privacy_mode: 'exact',
            is_featured: false,
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
            .from('items')
            .insert({
              sale_id: sale.id,
              name: item.name,
              description: null,
              price: Math.round(item.price * 100), // Convert to cents
              category: null,
              condition: null,
              images: [],
              is_sold: false,
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
