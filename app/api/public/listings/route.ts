import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userParam = url.searchParams.get('user') || ''
  const page = Number(url.searchParams.get('page') || '1')
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || '12')))
  if (!userParam) return NextResponse.json({ error: 'user required' }, { status: 400 })
  const supabase = createSupabaseServerClient()
  // Resolve userParam to user id via profiles_v2 if needed
  const prof = await supabase.from('profiles_v2').select('id, username').or(`id.eq.${userParam},username.eq.${userParam}`).maybeSingle()
  if (!prof.data?.id) return NextResponse.json({ error: 'user not found' }, { status: 404 })
  const userId = prof.data.id

  const from = (page - 1) * limit
  const to = from + limit - 1
  const q = await supabase
    .from('sales_v2')
    .select('id, title, cover_url, address, status, owner_id', { count: 'exact' })
    .eq('owner_id', userId)
    .eq('status', 'active')
    .range(from, to)

  const items = q.data || []
  const total = q.count || 0
  const hasMore = to + 1 < total
  return NextResponse.json({ items, page, hasMore })
}


