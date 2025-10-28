import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

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
  try {
    const supabase = createSupabaseServerClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const { title, description, price, sale_id, category, condition } = body
    
    if (!sale_id) {
      return NextResponse.json({ error: 'Sale ID is required' }, { status: 400 })
    }
    
    // Verify user owns the sale
    const { data: sale, error: saleError } = await supabase
      .from('sales_v2')
      .select('id, owner_id')
      .eq('id', sale_id)
      .eq('owner_id', user.id)
      .single()
    
    if (saleError || !sale) {
      return NextResponse.json({ error: 'Sale not found or access denied' }, { status: 400 })
    }
    
    const { data, error } = await supabase
      .from('items_v2')
      .insert({
        sale_id,
        name: title,
        description,
        price,
        category,
        condition,
        owner_id: user.id // This will be enforced by RLS
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
    
    const body = await request.json()
    const { title, description, price, category, condition } = body
    
    const { data, error } = await supabase
      .from('items_v2')
      .update({
        name: title,
        description,
        price,
        category,
        condition
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
    
    const { data, error } = await supabase
      .from('items_v2')
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
