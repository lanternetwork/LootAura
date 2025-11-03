import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const saleId = params.id

  // Toggle favorite in base table through public view
  // First check if exists
  const { data: existing } = await supabase
    .from('favorites_v2')
    .select('sale_id')
    .eq('user_id', user.id)
    .eq('sale_id', saleId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('favorites_v2')
      .delete()
      .eq('user_id', user.id)
      .eq('sale_id', saleId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, favorited: false })
  }

  // Insert with upsert to avoid duplicate conflicts if called twice rapidly
  const { error } = await supabase
    .from('favorites_v2')
    .upsert({ user_id: user.id, sale_id: saleId }, { onConflict: 'user_id,sale_id', ignoreDuplicates: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, favorited: true })
}


