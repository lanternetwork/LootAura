// NOTE: Writes → lootaura_v2.* only. Reads from views allowed. Do not write to views.
import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { ok, fail } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

const ALLOWED_EVENT_TYPES = ['view', 'save', 'click', 'share', 'favorite'] as const
type EventType = typeof ALLOWED_EVENT_TYPES[number]

/**
 * POST /api/analytics/track
 * Track an analytics event (view, save, click, share, favorite)
 * 
 * Body: {
 *   sale_id: string
 *   event_type: 'view' | 'save' | 'click' | 'share' | 'favorite'
 *   referrer?: string
 *   user_agent?: string
 * }
 */
export async function POST(request: NextRequest) {
  // CSRF protection check
  const { checkCsrfIfRequired } = await import('@/lib/api/csrfCheck')
  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    return csrfError
  }

  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    let body: any
    try {
      body = await request.json()
    } catch (error) {
      return fail(400, 'INVALID_JSON', 'Invalid JSON in request body')
    }

    const { sale_id, event_type, referrer, user_agent } = body

    // Validate required fields
    if (!sale_id || typeof sale_id !== 'string') {
      return fail(400, 'INVALID_INPUT', 'sale_id is required')
    }

    if (!event_type || !ALLOWED_EVENT_TYPES.includes(event_type as EventType)) {
      return fail(400, 'INVALID_INPUT', `event_type must be one of: ${ALLOWED_EVENT_TYPES.join(', ')}`)
    }

    // Get sale to retrieve owner_id
    const { getRlsDb } = await import('@/lib/supabase/clients')
    const rls = await getRlsDb()
    const { data: sale, error: saleError } = await fromBase(rls, 'sales')
      .select('owner_id')
      .eq('id', sale_id)
      .maybeSingle()

    if (saleError || !sale) {
      return fail(404, 'SALE_NOT_FOUND', 'Sale not found')
    }

    // Get referrer and user agent from request headers if not provided
    const finalReferrer = referrer || request.headers.get('referer') || null
    const finalUserAgent = user_agent || request.headers.get('user-agent') || null

    // Insert analytics event using admin client (bypasses RLS for inserts)
    const admin = getAdminDb()
    const { data: event, error: insertError } = await fromBase(admin, 'analytics_events')
      .insert({
        sale_id,
        owner_id: sale.owner_id,
        user_id: user?.id || null,
        event_type,
        referrer: finalReferrer,
        user_agent: finalUserAgent,
        is_test: false,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[ANALYTICS_TRACK] Error inserting event:', insertError)
      return fail(500, 'TRACK_FAILED', 'Failed to track event', {
        supabase: insertError.message,
        code: insertError.code,
      })
    }

    return ok({ data: { event_id: event.id } })
  } catch (e: any) {
    console.error('[ANALYTICS_TRACK] Unexpected error:', e)
    return fail(500, 'INTERNAL_ERROR', e.message)
  }
}

