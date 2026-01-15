/**
 * Admin-only endpoint for listing published sales
 * GET /api/admin/sales/list
 * 
 * Returns a simple list of published, non-archived sales for admin tools.
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Require admin access
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json(
      { error: 'Forbidden: Admin access required' },
      { status: 403 }
    )
  }

  try {
    const adminDb = getAdminDb()

    // Fetch published, non-archived sales
    const { data: sales, error: salesError } = await fromBase(adminDb, 'sales')
      .select('id, title, city, state, date_start')
      .in('status', ['published', 'active'])
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(500) // Reasonable limit for dropdown

    if (salesError) {
      logger.error('Failed to fetch sales for admin list', salesError instanceof Error ? salesError : new Error(String(salesError)), {
        component: 'admin/sales',
        operation: 'list',
      })
      return NextResponse.json(
        { error: 'Failed to fetch sales' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      sales: sales || [],
    })
  } catch (error) {
    logger.error('Unexpected error in admin sales list', error instanceof Error ? error : new Error(String(error)), {
      component: 'admin/sales',
      operation: 'list',
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
