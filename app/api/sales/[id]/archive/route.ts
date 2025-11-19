// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(req)
  if (csrfError) {
    return csrfError
  }

  const supabase = createSupabaseServerClient()
  const { data: user } = await supabase.auth.getUser()
  if (!user?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  
  const saleId = params.id
  const { status } = await req.json().catch(() => ({ status: 'completed' }))
  
  // Write to base table using schema-scoped client
  const db = getRlsDb()
  const { data, error } = await fromBase(db, 'sales')
    .update({ status })
    .eq('id', saleId)
    .eq('owner_id', user.user.id)
    .select()
    .single()
  
  if (error) {
    console.error('[SALES/ARCHIVE] Error archiving sale:', error)
    return NextResponse.json({ ok: false, code: 'ARCHIVE_FAILED', error: 'Failed to update sale status' }, { status: 500 })
  }
  
  return NextResponse.json({ success: true, data })
}

