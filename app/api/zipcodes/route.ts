import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    const zip = searchParams.get('zip')
    const state = searchParams.get('state')
    const city = searchParams.get('city')
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10

    let query = supabase
      .from('zipcodes')
      .select('zip, lat, lng, city, state')
      .limit(limit)

    // Apply filters
    if (zip) {
      query = query.eq('zip', zip)
    }
    if (state) {
      query = query.ilike('state', `%${state}%`)
    }
    if (city) {
      query = query.ilike('city', `%${city}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('ZIP codes query error:', error)
      return NextResponse.json({ 
        ok: false, 
        error: 'Failed to fetch ZIP codes' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      ok: true, 
      count: data?.length || 0, 
      data: data || [] 
    })

  } catch (error: any) {
    console.error('ZIP codes API error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
