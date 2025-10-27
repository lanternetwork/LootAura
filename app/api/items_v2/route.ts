import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

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
  try {
    const supabase = createSupabaseServerClient()
    const body = await request.json()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Validate that the sale belongs to the authenticated user
    if (body.sale_id) {
      const { data: sale, error: saleError } = await supabase
        .from('sales_v2')
        .select('owner_id')
        .eq('id', body.sale_id)
        .single()
      
      if (saleError || !sale) {
        return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
      }
      
      if (sale.owner_id !== user.id) {
        return NextResponse.json({ error: 'You can only create items for your own sales' }, { status: 400 })
      }
    }
    
    const { data: item, error } = await supabase
      .from('items_v2')
      .insert({
        owner_id: user.id,
        sale_id: body.sale_id,
        title: body.title,
        description: body.description,
        price: body.price,
        category: body.category,
        condition: body.condition,
        images: body.images || []
      })
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
    
    const { data: item, error } = await supabase
      .from('items_v2')
      .update(body)
      .eq('id', itemId)
      .eq('owner_id', user.id) // Ensure user can only update their own items
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
    
    const { error } = await supabase
      .from('items_v2')
      .delete()
      .eq('id', itemId)
      .eq('owner_id', user.id) // Ensure user can only delete their own items
    
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
