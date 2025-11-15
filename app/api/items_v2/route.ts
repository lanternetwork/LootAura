// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    // Get query parameters
    const sale_id = searchParams.get('sale_id')
    const my_items = searchParams.get('my_items')
    
    let query = supabase
      .from('items_v2')
      .select('*')
    
    // If my_items is true, filter by authenticated user
    if (my_items === 'true') {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      query = query.eq('owner_id', user.id)
    } else if (sale_id) {
      // Filter by sale_id for public access
      query = query.eq('sale_id', sale_id)
    }
    
    const { data: items, error } = await query
    
    if (error) {
      console.error('Error fetching items:', error)
      return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
    }
    
    return NextResponse.json({ items })
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
    
    // Write to base table using schema-scoped client
    const db = getRlsDb()
    
    // Validate that the sale belongs to the authenticated user
    if (body.sale_id) {
      // Read from base table to check ownership (sales_v2 view doesn't include owner_id for security)
      const { data: sale, error: saleError } = await fromBase(db, 'sales')
        .select('id, owner_id')
        .eq('id', body.sale_id)
        .single()
      
      if (saleError || !sale) {
        return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
      }
      
      if (sale.owner_id !== user.id) {
        return NextResponse.json({ error: 'You can only create items for your own sales' }, { status: 400 })
      }
    }
    
    // Normalize images: prefer images array, fallback to image_url
    const images = Array.isArray(body.images) && body.images.length > 0
      ? body.images
      : (body.image_url ? [body.image_url] : [])
    
    // Get first image URL for image_url column (fallback for compatibility)
    // Always use body.image_url if provided, even if empty string (to allow clearing)
    const firstImageUrl = body.image_url !== undefined 
      ? (body.image_url || null)  // Allow empty string to be saved as null
      : (images.length > 0 ? images[0] : null)
    
    // Build insert payload - try to include both images array and image_url
    const insertPayload: any = {
      sale_id: body.sale_id,
      name: body.title,
      description: body.description,
      price: body.price,
      category: body.category,
      condition: body.condition,
    }
    
    // Add image_url (this column definitely exists)
    // Always set it, even if null, to ensure it's saved
    insertPayload.image_url = firstImageUrl
    
    // Add images array if we have images (this column might not exist, but we'll try)
    if (images.length > 0) {
      insertPayload.images = images
    }
    
    // Log for debugging (only in non-production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ITEMS_V2] Creating item with image data:', {
        hasImageUrl: !!body.image_url,
        imageUrl: body.image_url,
        hasImages: Array.isArray(body.images) && body.images.length > 0,
        images: body.images,
        firstImageUrl,
        insertPayloadImageUrl: insertPayload.image_url,
      })
    }
    
    const { data: item, error } = await fromBase(db, 'items')
      .insert(insertPayload)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating item:', error)
      return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
    }
    
    return NextResponse.json({ item }, { status: 201 })
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
    const itemId = pathname.split('/').pop()
    const body = await request.json()
    
    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Write to base table using schema-scoped client
    const db = getRlsDb()
    const { data: item, error } = await fromBase(db, 'items')
      .update(body)
      .eq('id', itemId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating item:', error)
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
    }
    
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }
    
    return NextResponse.json({ item })
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
    const itemId = pathname.split('/').pop()
    
    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Write to base table using schema-scoped client
    const db = getRlsDb()
    const { error } = await fromBase(db, 'items')
      .delete()
      .eq('id', itemId)
    
    if (error) {
      console.error('Error deleting item:', error)
      return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
