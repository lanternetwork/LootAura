// NOTE: Writes → lootaura_v2.* only. Reads may use views.
import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

// This route uses auth (cookies) and performs DB writes, so it must always be dynamic.
export const dynamic = 'force-dynamic'

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
      const errorCode = (deleteError as any)?.code
      const errorMessage = (deleteError as any)?.message || 'Unknown error'
      
      console.error('[ANALYTICS_PURGE] Error deleting events:', {
        code: errorCode,
        message: errorMessage,
      })
      
      // Check if table doesn't exist
      if (errorCode === '42P01' || 
          errorMessage.includes('does not exist') ||
          errorMessage.includes('Could not find the table') ||
          errorMessage.includes('schema cache')) {
        return NextResponse.json({ 
          error: 'Analytics table does not exist. Please run database migrations first.' 
        }, { status: 400 })
      }
      
      return NextResponse.json({ 
        error: `Failed to purge events: ${errorMessage}` 
      }, { status: 500 })
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

