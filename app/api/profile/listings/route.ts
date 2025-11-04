import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'active'
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const from = (page - 1) * limit
  const to = from + limit - 1
  
  // Map status to database values: 'active' -> 'published', 'archived' -> 'completed', 'drafts' -> 'draft'
  const statusMap: Record<string, string> = {
    active: 'published',
    archived: 'completed',
    drafts: 'draft',
  }
  const dbStatus = statusMap[status] || status
  
  // Try to query sales_v2 view
  // If it fails, try with minimal columns or return empty results
  let query = supabase
    .from('sales_v2')
    .select('id, title, cover_url, address, status, owner_id', { count: 'exact' })
    .eq('owner_id', user.id)
    .eq('status', dbStatus)
    .order('created_at', { ascending: false })
    .range(from, to)
  
  const { data, error, count } = await query
  
  if (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.error('[PROFILE LISTINGS] GET error:', error, { status: dbStatus, userId: user.id })
    }
    
    // If error is about missing columns, try with minimal columns
    if (error.message?.includes('column') || error.message?.includes('not found')) {
      const { data: minimalData, error: minimalError, count: minimalCount } = await supabase
        .from('sales_v2')
        .select('id, title, status, owner_id', { count: 'exact' })
        .eq('owner_id', user.id)
        .eq('status', dbStatus)
        .order('created_at', { ascending: false })
        .range(from, to)
      
      if (!minimalError) {
        return NextResponse.json({
          items: minimalData || [],
          total: minimalCount || 0,
          page,
          hasMore: to + 1 < (minimalCount || 0),
        })
      }
    }
    
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({
    items: data || [],
    total: count || 0,
    page,
    hasMore: to + 1 < (count || 0),
  })
}
