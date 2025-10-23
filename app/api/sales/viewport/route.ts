/* eslint-disable no-undef */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { SalesResponseSchema, normalizeSalesJson } from '@/lib/data/sales-schemas'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  
  try {
    const { searchParams } = new URL(request.url)
    
    // Parse bbox parameters
    const minLng = parseFloat(searchParams.get('minLng') || '')
    const minLat = parseFloat(searchParams.get('minLat') || '')
    const maxLng = parseFloat(searchParams.get('maxLng') || '')
    const maxLat = parseFloat(searchParams.get('maxLat') || '')
    const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 1000)
    
    if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Missing or invalid bbox parameters' 
      }, { status: 400 })
    }
    
    const supabase = createSupabaseServerClient()
    
    // Query sales within bbox
    const { data: salesData, error } = await supabase
      .from('sales_v2')
      .select('*')
      .gte('lng', minLng)
      .lte('lng', maxLng)
      .gte('lat', minLat)
      .lte('lat', maxLat)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .limit(limit)
    
    if (error) {
      console.error('Viewport query error:', error)
      return NextResponse.json({
        ok: false,
        error: 'Database query failed',
        code: (error as any)?.code,
        details: (error as any)?.message
      }, { status: 500 })
    }
    
    // Return normalized response using contract
    const raw = {
      sales: salesData || [],
      bbox: { minLng, minLat, maxLng, maxLat },
      count: (salesData || []).length,
      durationMs: Date.now() - startedAt
    }
    
    const normalized = normalizeSalesJson(raw)
    const parsed = SalesResponseSchema.safeParse(normalized)
    const response = parsed.success ? parsed.data : { sales: [], meta: { parse: "failed" } }
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'CDN-Cache-Control': 'public, max-age=300',
        'Vary': 'Accept-Encoding'
      }
    })
    
  } catch (error: any) {
    console.log(`[VIEWPORT][ERROR] Unexpected error: ${error?.message || error}`)
    return NextResponse.json({ 
      ok: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
