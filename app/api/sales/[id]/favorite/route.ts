import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const supabase = createSupabaseServerClient()

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Handle params as Promise (Next.js 15+) or object (Next.js 13/14)
  const resolvedParams = await Promise.resolve(params)
  const saleId = resolvedParams.id

  if (!saleId) {
    return NextResponse.json({ error: 'Sale ID is required' }, { status: 400 })
  }

  // Toggle favorite in base table through public view
  // First check if exists
  const { data: existing, error: checkError } = await supabase
    .from('favorites_v2')
    .select('sale_id')
    .eq('user_id', user.id)
    .eq('sale_id', saleId)
    .maybeSingle()

  if (checkError) {
    console.error('[FAVORITE_API] Error checking existing favorite:', checkError)
    return NextResponse.json({ error: checkError.message }, { status: 400 })
  }

  if (existing) {
    // Delete the specific favorite - ensure we only delete this one
    const { error: deleteError } = await supabase
      .from('favorites_v2')
      .delete()
      .eq('user_id', user.id)
      .eq('sale_id', saleId)

    if (deleteError) {
      console.error('[FAVORITE_API] Error deleting favorite:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 400 })
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[FAVORITE_API] Deleted favorite:', { userId: user.id, saleId })
    }

    return NextResponse.json({ ok: true, favorited: false })
  }

  // Insert with upsert to avoid duplicate conflicts if called twice rapidly
  const { error: upsertError } = await supabase
    .from('favorites_v2')
    .upsert({ user_id: user.id, sale_id: saleId }, { onConflict: 'user_id,sale_id', ignoreDuplicates: true })

  if (upsertError) {
    console.error('[FAVORITE_API] Error upserting favorite:', upsertError)
    return NextResponse.json({ error: upsertError.message }, { status: 400 })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[FAVORITE_API] Added favorite:', { userId: user.id, saleId })
  }

  return NextResponse.json({ ok: true, favorited: true })
}


