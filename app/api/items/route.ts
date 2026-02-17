// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { isAllowedImageUrl } from '@/lib/images/validateImageUrl'
import { normalizeItemImages } from '@/lib/data/itemImageNormalization'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const { searchParams } = new URL(request.url)
    
    const saleId = searchParams.get('sale_id')
    const myItems = searchParams.get('my_items') === 'true'
    
    if (myItems) {
      // Get items from user's own sales (requires authentication)
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      
      const { data: items, error } = await supabase
        .from('items_v2')
        .select(`
          *,
          sales_v2!inner(owner_id)
        `)
        .eq('sales_v2.owner_id', user.id)
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Error fetching user items:', error)
        return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
      }
      
      return NextResponse.json({ items: items || [] })
    } else if (saleId) {
      // Get items from a specific sale (public access for published sales)
      const { data: items, error } = await supabase
        .from('items_v2')
        .select('*')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Error fetching sale items:', error)
        return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
      }
      
      return NextResponse.json({ items: items || [] })
    } else {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }
  } catch (error) {
    console.error('Items GET error:', error)
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
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }
    
    const body = await request.json()
    const { title, description, price, sale_id, category, condition, image_url } = body
    
    if (!sale_id) {
      return NextResponse.json({ error: 'Sale ID is required' }, { status: 400 })
    }
    
    // Verify user owns the sale (read from base table - sales_v2 view doesn't include owner_id for security)
    const db = await getRlsDb()
    const { data: sale, error: saleError } = await fromBase(db, 'sales')
      .select('id, owner_id')
      .eq('id', sale_id)
      .eq('owner_id', user.id)
      .single()
    
    if (saleError || !sale) {
      return NextResponse.json({ error: 'Sale not found or access denied' }, { status: 400 })
    }
    
    // Validate optional image URL
    if (image_url && !isAllowedImageUrl(image_url)) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[ITEMS] Rejected image_url', image_url)
      }
      return NextResponse.json({ error: 'Invalid image_url' }, { status: 400 })
    }

    // Normalize image fields to canonical format (images array + image_url for compatibility)
    const normalizedImages = normalizeItemImages({
      image_url,
      images: undefined, // Legacy route only accepts image_url
    })
    
    // Write to base table using schema-scoped client (reuse db from above)
    const { data, error } = await fromBase(db, 'items')
      .insert({
        sale_id,
        name: title,
        description,
        price,
        category,
        condition,
        // Always set both fields for consistency (base table is authoritative)
        images: normalizedImages.images,
        image_url: normalizedImages.image_url,
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating item:', error)
      return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
    }
    
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (error) {
    console.error('Items POST error:', error)
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
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
      await assertAccountNotLocked(user.id)
    } catch (error) {
      if (error instanceof NextResponse) return error
      throw error
    }
    
    const { pathname } = new URL(request.url)
    const itemId = pathname.split('/').pop()
    
    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }
    
    const body = await request.json()
    const { title, description, price, category, condition, image_url } = body

    // Validate optional image URL
    if (image_url && !isAllowedImageUrl(image_url)) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[ITEMS] Rejected image_url on update', image_url)
      }
      return NextResponse.json({ error: 'Invalid image_url' }, { status: 400 })
    }

    // Normalize image fields to canonical format (images array + image_url for compatibility)
    const normalizedImages = normalizeItemImages({
      image_url,
      images: undefined, // Legacy route only accepts image_url
    })
    
    // Write to base table using schema-scoped client
    const db = await getRlsDb()
    const { data, error } = await fromBase(db, 'items')
      .update({
        name: title,
        description,
        price,
        category,
        condition,
        // Always set both fields for consistency (base table is authoritative)
        images: normalizedImages.images,
        image_url: normalizedImages.image_url,
      })
      .eq('id', itemId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating item:', error)
      return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
    }
    
    if (!data) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }
    
    return NextResponse.json({ item: data })
  } catch (error) {
    console.error('Items PUT error:', error)
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
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { pathname } = new URL(request.url)
    const itemId = pathname.split('/').pop()
    
    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    }
    
    // Write to base table using schema-scoped client
    const db = await getRlsDb()
    const { data, error } = await fromBase(db, 'items')
      .delete()
      .eq('id', itemId)
      .select()
      .single()
    
    if (error) {
      console.error('Error deleting item:', error)
      return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
    }
    
    if (!data) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Items DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
