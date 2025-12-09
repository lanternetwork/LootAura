// Admin-only endpoint for querying sale reports

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function getReportsHandler(request: NextRequest) {
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
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'open'
    const reason = searchParams.get('reason') || undefined
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
    const offset = (page - 1) * limit

    const adminDb = getAdminDb()

    // Build query for reports
    let query = fromBase(adminDb, 'sale_reports')
      .select(`
        id,
        sale_id,
        reporter_profile_id,
        reason,
        details,
        status,
        action_taken,
        admin_notes,
        created_at,
        updated_at,
        sales:sale_id (
          id,
          title,
          address,
          city,
          state,
          owner_id
        )
      `, { count: 'exact' })

    // Filter by status
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Filter by reason
    if (reason) {
      query = query.eq('reason', reason)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: reports, error, count } = await query

    if (error) {
      logger.error('Failed to fetch reports', error instanceof Error ? error : new Error(String(error)), {
        component: 'moderation',
        operation: 'get_reports',
      })
      return NextResponse.json(
        { error: 'Failed to fetch reports' },
        { status: 500 }
      )
    }

    // Get reporter and owner profile info (minimal - username/email snippets)
    // For now, return basic info - can enhance later

    return NextResponse.json({
      ok: true,
      data: reports || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    logger.error('Unexpected error in getReportsHandler', error instanceof Error ? error : new Error(String(error)), {
      component: 'moderation',
      operation: 'get_reports',
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return withRateLimit(
    getReportsHandler,
    [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY],
    {}
  )(request)
}

