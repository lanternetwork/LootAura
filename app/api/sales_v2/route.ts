// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { assertNoUnsavory } from '@/lib/filters/profanity'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    // Get query parameters
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const radius = searchParams.get('radius') || '25'
    const status = searchParams.get('status') || 'published'
    const my_sales = searchParams.get('my_sales')
    
    let query = supabase
      .from('sales_v2')
      .select('*')
    
    // If my_sales is true, filter by authenticated user
    if (my_sales === 'true') {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }
      query = query.eq('owner_id', user.id)
    } else {
      // Only show published sales for public access
      query = query.eq('status', status)
    }
    
    // Add location filtering if coordinates provided
    if (lat && lng) {
      const radiusKm = parseFloat(radius)
      // Note: This is a simplified distance filter
      // In production, you'd want to use PostGIS or a more sophisticated approach
      query = query
        .gte('lat', parseFloat(lat) - (radiusKm / 111)) // Rough conversion: 1 degree ≈ 111 km
        .lte('lat', parseFloat(lat) + (radiusKm / 111))
        .gte('lng', parseFloat(lng) - (radiusKm / 111))
        .lte('lng', parseFloat(lng) + (radiusKm / 111))
    }
    
    const { data: sales, error } = await query
    
    if (error) {
      console.error('Error fetching sales:', error)
      return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 })
    }
    
    return NextResponse.json({ sales })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const supabase = createSupabaseServerClient()
    const body = await request.json()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    // Reject unsavory words in free-text fields
    const cleanCheck = assertNoUnsavory([
      ['title', body.title],
      ['description', body.description],
      ['address', body.address],
      ['city', body.city],
      ['state', body.state],
    ])
    if (!cleanCheck.ok) {
      return NextResponse.json({ error: `Inappropriate language in ${cleanCheck.field}` }, { status: 400 })
    }

    // Validate and normalize status
    const validStatuses = ['draft', 'published', 'archived', 'active'] as const
    const requestedStatus = body.status || 'draft'
    const status: 'draft' | 'published' | 'archived' | 'active' = 
      validStatuses.includes(requestedStatus as typeof validStatuses[number]) 
        ? (requestedStatus as 'draft' | 'published' | 'archived' | 'active')
        : 'draft'

    // Write to base table using schema-scoped client
    const db = await getRlsDb()
    const { data: sale, error } = await fromBase(db, 'sales')
      .insert({
        owner_id: user.id,
        title: body.title,
        description: body.description,
        address: body.address,
        city: body.city,
        state: body.state,
        zip_code: body.zip_code,
        lat: body.lat,
        lng: body.lng,
        date_start: body.date_start,
        time_start: body.time_start,
        date_end: body.date_end,
        time_end: body.time_end,
        status,
        privacy_mode: body.privacy_mode || 'exact'
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating sale:', error)
      return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
    }
    
    return NextResponse.json({ sale })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const supabase = createSupabaseServerClient()
    const { pathname } = new URL(request.url)
    const saleId = pathname.split('/').pop()
    const body = await request.json()
    
    if (!saleId) {
      return NextResponse.json({ error: 'Sale ID is required' }, { status: 400 })
    }
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    // Write to base table using schema-scoped client
    const db = await getRlsDb()
    const { data: sale, error } = await fromBase(db, 'sales')
      .update(body)
      .eq('id', saleId)
      .eq('owner_id', user.id) // Ensure user can only update their own sales
      .select()
      .single()
    
    if (error) {
      console.error('Error updating sale:', error)
      return NextResponse.json({ error: 'Failed to update sale' }, { status: 500 })
    }
    
    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }
    
    return NextResponse.json({ sale })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const supabase = createSupabaseServerClient()
    const { pathname } = new URL(request.url)
    const saleId = pathname.split('/').pop()
    
    if (!saleId) {
      return NextResponse.json({ error: 'Sale ID is required' }, { status: 400 })
    }
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    // Write to base table using schema-scoped client
    const db = await getRlsDb()
    const { error } = await fromBase(db, 'sales')
      .delete()
      .eq('id', saleId)
      .eq('owner_id', user.id) // Ensure user can only delete their own sales
    
    if (error) {
      console.error('Error deleting sale:', error)
      return NextResponse.json({ error: 'Failed to delete sale' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
