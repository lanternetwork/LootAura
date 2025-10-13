import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// TEMP debug endpoint - only available with NEXT_PUBLIC_DEBUG=true
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Only allow in debug mode
  if (process.env.NEXT_PUBLIC_DEBUG !== 'true') {
    return NextResponse.json({ error: 'Debug endpoint not available' }, { status: 404 })
  }

  try {
    const sb = createSupabaseServerClient()
    
    // Probe the exact relation used by list endpoint
    // Check if category is single TEXT or array
    const { data: schemaInfo, error: schemaError } = await sb
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'items_v2')
      .eq('column_name', 'category')

    if (schemaError) {
      return NextResponse.json({ error: 'Schema check failed', details: schemaError }, { status: 500 })
    }

    const isArray = schemaInfo?.[0]?.data_type === 'ARRAY'
    const schema = isArray ? 'array' : 'text'

    let categoryData: any[] = []
    
    if (isArray) {
      // Handle categories as TEXT[] array
      const { data, error } = await sb
        .from('items_v2')
        .select('categories')
        .not('categories', 'is', null)
      
      if (error) {
        return NextResponse.json({ error: 'Array query failed', details: error }, { status: 500 })
      }

      // Flatten and count array values
      const flatCategories: string[] = []
      data?.forEach(row => {
        if (row.categories && Array.isArray(row.categories)) {
          row.categories.forEach(cat => {
            if (cat && typeof cat === 'string') {
              flatCategories.push(cat.trim().toLowerCase())
            }
          })
        }
      })

      // Count occurrences
      const categoryCounts: { [key: string]: number } = {}
      flatCategories.forEach(cat => {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
      })

      categoryData = Object.entries(categoryCounts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
    } else {
      // Handle category as single TEXT
      const { data, error } = await sb
        .from('items_v2')
        .select('category')
        .not('category', 'is', null)
        .neq('category', '')
      
      if (error) {
        return NextResponse.json({ error: 'Text query failed', details: error }, { status: 500 })
      }

      // Count occurrences
      const categoryCounts: { [key: string]: number } = {}
      data?.forEach(row => {
        if (row.category && typeof row.category === 'string') {
          const normalized = row.category.trim().toLowerCase()
          if (normalized) {
            categoryCounts[normalized] = (categoryCounts[normalized] || 0) + 1
          }
        }
      })

      categoryData = Object.entries(categoryCounts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
    }

    // Log first 30 values for debugging
    console.log('[CATEGORY PROBE] Top 30 DB values:', categoryData.slice(0, 30))

    return NextResponse.json({
      catsFromDb: categoryData,
      schema,
      totalCategories: categoryData.length,
      sampleValues: categoryData.slice(0, 10)
    })

  } catch (error) {
    console.error('[CATEGORY PROBE] Error:', error)
    return NextResponse.json({ 
      error: 'Category probe failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
