// Admin-only endpoint to get archive system status
// Shows recent archive activity and statistics

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function getArchiveStatusHandler(request: NextRequest) {
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
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const todayStr = today.toISOString().split('T')[0]

    // Get statistics
    const [totalArchived, recentlyArchived, pendingArchive, totalActive] = await Promise.all([
      // Total archived sales
      fromBase(adminDb, 'sales')
        .select('id', { count: 'exact' })
        .eq('status', 'archived')
        .not('archived_at', 'is', null),
      
      // Sales archived in last 24 hours
      fromBase(adminDb, 'sales')
        .select('id', { count: 'exact' })
        .eq('status', 'archived')
        .not('archived_at', 'is', null)
        .gte('archived_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      
      // Sales that should be archived (pending)
      fromBase(adminDb, 'sales')
        .select('id, title, date_end, date_start')
        .in('status', ['published', 'active'])
        .is('archived_at', null)
        .limit(50),
      
      // Total active/published sales
      fromBase(adminDb, 'sales')
        .select('id', { count: 'exact' })
        .in('status', ['published', 'active']),
    ])

    // Filter pending sales that have ended
    const pendingSales = (pendingArchive.data || []).filter((sale: any) => {
      return (
        (sale.date_end && sale.date_end <= todayStr) ||
        (!sale.date_end && sale.date_start && sale.date_start < todayStr)
      )
    })

    return NextResponse.json({
      ok: true,
      statistics: {
        totalArchived: totalArchived.count || 0,
        recentlyArchived: recentlyArchived.count || 0,
        pendingArchive: pendingSales.length,
        totalActive: totalActive.count || 0,
      },
      pendingSales: pendingSales.slice(0, 10).map((sale: any) => ({
        id: sale.id,
        title: sale.title || 'Untitled',
        date_end: sale.date_end,
        date_start: sale.date_start,
      })),
    })
  } catch (error) {
    logger.error('Failed to get archive status', error instanceof Error ? error : new Error(String(error)), {
      component: 'api/admin/archive/status',
    })
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return getArchiveStatusHandler(request)
}

