import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isAllowedImageUrl } from '@/lib/images/validateImageUrl'
import { assertNoUnsavory } from '@/lib/filters/profanity'
import { T } from '@/lib/supabase/tables'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    // Get query parameters
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const radius = searchParams.get('radius') || '25'
    const status = searchParams.get('status') || 'published'
    
    let query = supabase
      .from(T.sales)
      .select('*')
      .eq('status', status)
    
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Basic required field validation
    const required: Array<[keyof typeof body, string]> = [
      ['title', 'Title is required'],
      ['address', 'Address is required'],
      ['city', 'City is required'],
      ['state', 'State is required'],
      ['date_start', 'Start date is required'],
      ['time_start', 'Start time is required'],
    ]
    for (const [key, message] of required) {
      if (!body[key]) {
        return NextResponse.json({ error: message }, { status: 400 })
      }
    }

    // Validate images and cover URLs if provided
    if (body.cover_image_url && !isAllowedImageUrl(body.cover_image_url)) {
      return NextResponse.json({ error: 'Invalid cover_image_url' }, { status: 400 })
    }
    if (Array.isArray(body.images)) {
      for (const url of body.images) {
        if (url && !isAllowedImageUrl(url)) {
          return NextResponse.json({ error: 'Invalid image URL in images[]' }, { status: 400 })
        }
      }
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

    const { data: sale, error } = await supabase
      .from(T.sales)
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
        cover_image_url: body.cover_image_url ?? (Array.isArray(body.images) && body.images.length > 0 ? body.images[0] : null),
        images: Array.isArray(body.images) ? body.images : null,
        status: body.status || 'draft',
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
