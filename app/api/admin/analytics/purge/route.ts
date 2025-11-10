// NOTE: Writes → lootaura_v2.* only. Reads may use views.
import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

interface PurgeRequest {
  ownerId?: string
  saleId?: string
}

export async function POST(request: NextRequest) {
  try {
    // Check admin access
    await assertAdminOrThrow(request)

    const body: PurgeRequest = await request.json()
    const { ownerId, saleId } = body

    // Build delete query
    const adminDb = getAdminDb()
    let query = fromBase(adminDb, 'analytics_events')
      .delete()
      .eq('is_test', true)

    if (ownerId) {
      query = query.eq('owner_id', ownerId)
    }

    if (saleId) {
      query = query.eq('sale_id', saleId)
    }

    const { data: deleted, error: deleteError } = await query.select('id')

    if (deleteError) {
      console.error('[ANALYTICS_PURGE] Error deleting events:', deleteError)
      return NextResponse.json({ error: 'Failed to purge events' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      deleted: deleted?.length || 0,
    })
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    console.error('[ANALYTICS_PURGE] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

