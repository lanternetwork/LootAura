// Admin-only endpoint for querying users
// Allows admins to search users and view lock status

import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function getUsersHandler(request: NextRequest) {
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
    const q = searchParams.get('q') || ''
    const locked = searchParams.get('locked')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100) // Max 100
    const offset = (page - 1) * limit

    const adminDb = getAdminDb()

    // Build query for profiles - query lootaura_v2.profiles directly
    let query = fromBase(adminDb, 'profiles')
      .select('id, username, full_name, created_at, is_locked, locked_at, locked_by, lock_reason', { count: 'exact' })

    // Search by username or full_name
    if (q) {
      // Search by username or full_name (case-insensitive)
      // Use OR condition to match either field
      query = query.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
    }

    // Filter by lock status
    if (locked === 'true') {
      query = query.eq('is_locked', true)
    } else if (locked === 'false') {
      query = query.eq('is_locked', false)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: profiles, error, count } = await query

    if (error) {
      logger.error('Failed to fetch users', error instanceof Error ? error : new Error(String(error)), {
        component: 'moderation',
        operation: 'get_users',
        q,
        page,
        limit,
        errorCode: (error as any)?.code,
        errorMessage: (error as any)?.message,
      })
      return NextResponse.json(
        { error: 'Failed to fetch users', details: process.env.NEXT_PUBLIC_DEBUG === 'true' ? String(error) : undefined },
        { status: 500 }
      )
    }

    // Log for debugging
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      logger.debug('Admin users query result', {
        component: 'moderation',
        operation: 'get_users',
        q,
        page,
        limit,
        profilesCount: profiles?.length || 0,
        totalCount: count || 0,
      })
    }

    // Get sale counts and report counts for each user (optional, can be expensive)
    // For now, return basic info - can enhance later with aggregations

    return NextResponse.json({
      ok: true,
      data: profiles || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    logger.error('Unexpected error in getUsersHandler', error instanceof Error ? error : new Error(String(error)), {
      component: 'moderation',
      operation: 'get_users',
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return withRateLimit(
    getUsersHandler,
    [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY],
    {}
  )(request)
}

