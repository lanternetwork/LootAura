// Admin-only endpoint to get archive system status
// Shows recent archive activity and statistics

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { getPendingArchiveCounts } from '@/lib/sales/archiveEndedSalesSqlBatch'

export const dynamic = 'force-dynamic'

function isPendingArchiveRow(
  sale: { date_end?: string | null; date_start?: string | null; ends_at?: string | null },
  nowIso: string,
  todayStr: string
): boolean {
  if (sale.ends_at != null && String(sale.ends_at).trim() !== '' && sale.ends_at < nowIso) {
    return true
  }
  if (sale.ends_at == null || String(sale.ends_at).trim() === '') {
    if (sale.date_end && sale.date_end <= todayStr) return true
    if (!sale.date_end && sale.date_start && sale.date_start < todayStr) return true
  }
  return false
}

export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  try {
    const adminDb = getAdminDb()
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const todayStr = today.toISOString().split('T')[0]!
    const nowIso = now.toISOString()

    const [totalArchived, recentlyArchived, totalActive, pendingRpc, pendingRows] = await Promise.all([
      fromBase(adminDb, 'sales')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'archived')
        .not('archived_at', 'is', null),

      fromBase(adminDb, 'sales')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'archived')
        .not('archived_at', 'is', null)
        .gte('archived_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),

      fromBase(adminDb, 'sales')
        .select('id', { count: 'exact', head: true })
        .in('status', ['published', 'active']),

      getPendingArchiveCounts(adminDb),

      fromBase(adminDb, 'sales')
        .select('id, title, date_end, date_start, ends_at, status')
        .in('status', ['published', 'active'])
        .is('archived_at', null)
        .limit(120),
    ])

    const pendingSales = (pendingRows.data || []).filter((sale: any) =>
      isPendingArchiveRow(sale, nowIso, todayStr)
    )

    const pendingTotal =
      pendingRpc != null
        ? pendingRpc.pending_via_ends_at + pendingRpc.pending_via_legacy
        : pendingSales.length

    return NextResponse.json({
      ok: true,
      statistics: {
        totalArchived: totalArchived.count ?? 0,
        recentlyArchived: recentlyArchived.count ?? 0,
        pendingArchive: pendingTotal,
        totalActive: totalActive.count ?? 0,
        pending_via_ends_at: pendingRpc?.pending_via_ends_at ?? null,
        pending_via_legacy: pendingRpc?.pending_via_legacy ?? null,
        published_past_ends_at: pendingRpc?.published_past_ends_at ?? null,
        suspicious_ends_before_starts: pendingRpc?.suspicious_ends_before_starts ?? null,
      },
      pendingSales: pendingSales.slice(0, 10).map((sale: any) => ({
        id: sale.id,
        title: sale.title || 'Untitled',
        date_end: sale.date_end,
        date_start: sale.date_start,
        ends_at: sale.ends_at ?? null,
        status: sale.status,
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
