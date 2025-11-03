import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient()
  const { data: user } = await supabase.auth.getUser()
  if (!user?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  
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
  
  const { data, error, count } = await supabase
    .from('sales_v2')
    .select('id, title, cover_url, address, status, owner_id', { count: 'exact' })
    .eq('owner_id', user.user.id)
    .eq('status', dbStatus)
    .order('created_at', { ascending: false })
    .range(from, to)
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({
    items: data || [],
    total: count || 0,
    page,
    hasMore: to + 1 < (count || 0),
  })
}
