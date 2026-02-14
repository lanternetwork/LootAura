// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

async function deleteHandler(req: NextRequest, { params }: { params: { id: string } }) {
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
  
  // Use RLS-aware client - sales has RLS DELETE policy that allows owners to delete their own sales
  const rls = getRlsDb()
  const { error } = await fromBase(rls, 'sales')
    .delete()
    .eq('id', saleId)
    // RLS policy sales_owner_delete already enforces owner_id = auth.uid(), but we keep the explicit filter for clarity
    .eq('owner_id', user.user.id)
  
  if (error) {
    console.error('[SALES/DELETE] Error deleting sale:', error)
    return NextResponse.json({ ok: false, code: 'DELETE_FAILED', error: 'Failed to delete sale' }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  // Get user ID for rate limiting
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  return withRateLimit(
    (request) => deleteHandler(request, { params }),
    [Policies.MUTATE_MINUTE, Policies.MUTATE_DAILY],
    { userId }
  )(req)
}

