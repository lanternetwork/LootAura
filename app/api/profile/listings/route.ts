import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient()
  const { data: user } = await supabase.auth.getUser()
  if (!user?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || 'active'
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || '50')))

  const from = 0
  const to = limit - 1

  const q = await supabase
    .from('sales_v2')
    .select('id, title, cover_url, address, status, owner_id')
    .eq('owner_id', user.user.id)
    .eq('status', status)
    .range(from, to)

  const items = q.data || []
  return NextResponse.json({ items })
}

