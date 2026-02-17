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
  try {
    const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
    await assertAccountNotLocked(user.user.id)
  } catch (error) {
    if (error instanceof NextResponse) return error
    throw error
  }
  
  const saleId = params.id
  const body = await req.json().catch(() => ({}))
  const requestedStatus = body.status || 'archived'
  
  // Ensure we use 'archived' status (not 'completed')
  // Normalize to valid Sale status type
  let status: 'draft' | 'published' | 'archived' | 'active' = 'archived'
  if (requestedStatus === 'completed' || requestedStatus === 'cancelled') {
    status = 'archived'
  } else if (requestedStatus === 'draft' || requestedStatus === 'published' || requestedStatus === 'archived' || requestedStatus === 'active') {
    status = requestedStatus as 'draft' | 'published' | 'archived' | 'active'
  }
  
  // Write to base table using schema-scoped client
  const db = await getRlsDb()
  const updateData: { status: 'draft' | 'published' | 'archived' | 'active'; archived_at?: string } = { status }
  
  // Set archived_at timestamp when archiving
  if (status === 'archived') {
    updateData.archived_at = new Date().toISOString()
  }
  
  const { data, error } = await fromBase(db, 'sales')
    .update(updateData)
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

