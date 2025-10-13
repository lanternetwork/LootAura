import { NextRequest, NextResponse } from 'next/server'
import { normalizeCategories } from '@/lib/shared/categoryNormalizer'

// TEMP debug endpoint - only available with NEXT_PUBLIC_DEBUG=true
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Only allow in debug mode
  if (process.env.NEXT_PUBLIC_DEBUG !== 'true') {
    return NextResponse.json({ error: 'Debug endpoint not available' }, { status: 404 })
  }

  try {
    const url = new URL(request.url)
    const searchParams = url.searchParams
    
    // Parse categories from query params
    const categoriesParam = searchParams.get('categories') || searchParams.get('cat')
    const categoriesNormalized = normalizeCategories(categoriesParam)
    
    // Determine source based on URL path
    const source = url.pathname.includes('markers') ? 'markers' : 
                   url.pathname.includes('sales') ? 'list' : 'ui'
    
    const result = {
      categoriesNormalized,
      rawQuery: searchParams.toString(),
      source,
      timestamp: new Date().toISOString(),
      allParams: Object.fromEntries(searchParams.entries())
    }
    
    console.log('[FILTER ECHO] Parsed filters:', result)
    
    return NextResponse.json(result)

  } catch (error) {
    console.error('[FILTER ECHO] Error:', error)
    return NextResponse.json({ 
      error: 'Filter echo failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Only allow in debug mode
  if (process.env.NEXT_PUBLIC_DEBUG !== 'true') {
    return NextResponse.json({ error: 'Debug endpoint not available' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const categoriesNormalized = normalizeCategories(body.categories)
    
    const result = {
      categoriesNormalized,
      rawBody: body,
      source: 'post',
      timestamp: new Date().toISOString()
    }
    
    console.log('[FILTER ECHO] POST parsed filters:', result)
    
    return NextResponse.json(result)

  } catch (error) {
    console.error('[FILTER ECHO] POST Error:', error)
    return NextResponse.json({ 
      error: 'Filter echo failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}
