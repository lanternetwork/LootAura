import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

const AllowedStatusSchema = z.enum([
  'needs_check',
  'needs_geocode',
  'ready',
  'publishing',
  'published',
  'publish_failed',
  'rejected',
])

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status })
}

async function listIngestedSalesHandler(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      const status = error.status
      if (status === 401) return jsonError(401, 'UNAUTHORIZED', 'Unauthorized')
      if (status === 403) return jsonError(403, 'FORBIDDEN', 'Admin access required')
      return jsonError(status, 'AUTH_ERROR', 'Authentication failed')
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  try {
    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const rawLimit = searchParams.get('limit')
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 200)
      : 50

    let query = fromBase(getAdminDb(), 'ingested_sales')
      .select('id, status, failure_reasons, city, state, date_start, time_start, source_url, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (statusParam) {
      const parsedStatus = AllowedStatusSchema.safeParse(statusParam)
      if (!parsedStatus.success) {
        return jsonError(400, 'INVALID_STATUS', 'Invalid status filter')
      }
      query = query.eq('status', parsedStatus.data)
    }

    const { data, error } = await query
    if (error) {
      logger.error('Failed to list ingested sales', new Error(error.message), {
        component: 'admin/ingested-sales',
        operation: 'list',
        hasStatusFilter: Boolean(statusParam),
        limit,
      })
      return jsonError(500, 'INGESTED_SALES_LIST_FAILED', 'Failed to list ingested sales')
    }

    const rows = data || []
    const statusCounts: Record<string, number> = {
      needs_check: 0,
      needs_geocode: 0,
      ready: 0,
      published: 0,
      publish_failed: 0,
    }
    const failureCounts: Record<string, number> = {}

    for (const row of rows) {
      const statusKey = typeof row.status === 'string' ? row.status : 'unknown'
      statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1

      const failures = Array.isArray(row.failure_reasons) ? row.failure_reasons : []
      for (const reason of failures) {
        if (typeof reason !== 'string' || reason.length === 0) continue
        failureCounts[reason] = (failureCounts[reason] || 0) + 1
      }
    }

    logger.info('Ingestion summary', {
      total: rows.length,
      statusCounts,
      failureCounts,
    })

    return NextResponse.json({
      ok: true,
      data: rows,
    })
  } catch (error) {
    logger.error(
      'Unexpected error in ingested sales list endpoint',
      error instanceof Error ? error : new Error(String(error)),
      {
        component: 'admin/ingested-sales',
        operation: 'list',
      }
    )
    return jsonError(500, 'INTERNAL_ERROR', 'Internal server error')
  }
}

export const GET = withRateLimit(listIngestedSalesHandler, [
  Policies.ADMIN_TOOLS,
  Policies.ADMIN_HOURLY,
])
