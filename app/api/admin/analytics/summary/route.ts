// NOTE: Writes → lootaura_v2.* only. Reads may use views.
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

// This route uses auth (cookies) and performs DB queries, so it must always be dynamic.
export const dynamic = 'force-dynamic'

interface AnalyticsSummaryResponse {
  ok: boolean
  meta: {
    tableExists: boolean
    rlsReadable: boolean
    lastEventAt?: string
  }
  range: {
    from: string
    to: string
    days: number
  }
  totals: {
    view: number
    save: number
    click: number
    share: number
    favorite: number
  }
  series: Array<{
    date: string
    view: number
    save: number
    click: number
    share: number
    favorite: number
  }>
}

export async function GET(request: NextRequest) {
  try {
    // Check admin access
    const { user } = await assertAdminOrThrow(request)

    const { searchParams } = new URL(request.url)
    const ownerId = searchParams.get('ownerId') || user.id
    const saleId = searchParams.get('saleId')
    const days = parseInt(searchParams.get('days') || '7', 10)
    const includeTest = searchParams.get('includeTest') === 'true'

    const supabase = createSupabaseServerClient()
    const db = await getRlsDb()

    // Check if table exists and is readable
    let tableExists = false
    let rlsReadable = false
    let lastEventAt: string | undefined

    try {
      // Try to query the view (which reads from base table)
      const testQuery = supabase
        .from('analytics_events_v2')
        .select('ts')
        .limit(1)
        .order('ts', { ascending: false })

      if (!includeTest) {
        testQuery.eq('is_test', false)
      }

      const { data: testData, error: testError } = await testQuery

      tableExists = !testError || testError.code !== '42P01' // 42P01 = relation does not exist
      rlsReadable = !testError && testData !== null

      if (testData && testData.length > 0) {
        lastEventAt = testData[0].ts
      }
    } catch (err) {
      tableExists = false
      rlsReadable = false
    }

    // Calculate date range
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - days)

    // Build query - handle case where table doesn't exist
    let events: any[] = []

    try {
      let query = fromBase(db, 'analytics_events')
        .select('event_type, ts')
        .gte('ts', from.toISOString())
        .lte('ts', to.toISOString())
        .order('ts', { ascending: true })

      if (ownerId) {
        query = query.eq('owner_id', ownerId)
      }

      if (saleId) {
        // Verify sale belongs to owner (or admin override)
        const { data: sale } = await fromBase(db, 'sales')
          .select('owner_id')
          .eq('id', saleId)
          .single()

        if (sale && sale.owner_id !== ownerId && ownerId !== user.id) {
          return NextResponse.json({ error: 'Sale does not belong to owner' }, { status: 403 })
        }

        query = query.eq('sale_id', saleId)
      }

      if (!includeTest) {
        query = query.eq('is_test', false)
      }

      const { data, error } = await query
      
      if (error) {
        // Log error but return empty results - table might not exist yet
        const errorCode = (error as any)?.code
        const errorMessage = (error as any)?.message || 'Unknown error'
        console.warn('[ANALYTICS_SUMMARY] Query error (returning empty results):', {
          code: errorCode,
          message: errorMessage,
        })
        events = []
      } else {
        events = data || []
      }
    } catch (err) {
      // Table might not exist or other error - return empty results gracefully
      const errorCode = (err as any)?.code
      const errorMessage = (err as any)?.message || 'Unknown error'
      console.warn('[ANALYTICS_SUMMARY] Query exception (returning empty results):', {
        code: errorCode,
        message: errorMessage,
      })
      events = []
    }

    // Aggregate totals
    const totals = {
      view: 0,
      save: 0,
      click: 0,
      share: 0,
      favorite: 0,
    }

    // Group by date and event type
    const seriesMap = new Map<string, typeof totals>()

    events.forEach((event: any) => {
      const date = new Date(event.ts).toISOString().split('T')[0]
      const eventType = event.event_type as keyof typeof totals

      if (Object.prototype.hasOwnProperty.call(totals, eventType)) {
        totals[eventType]++

        if (!seriesMap.has(date)) {
          seriesMap.set(date, {
            view: 0,
            save: 0,
            click: 0,
            share: 0,
            favorite: 0,
          })
        }
        seriesMap.get(date)![eventType]++
      }
    })

    // Convert series map to array
    const series = Array.from(seriesMap.entries())
      .map(([date, counts]) => ({
        date,
        ...counts,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const response: AnalyticsSummaryResponse = {
      ok: true,
      meta: {
        tableExists,
        rlsReadable,
        lastEventAt,
      },
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        days,
      },
      totals,
      series,
    }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    console.error('[ANALYTICS_SUMMARY] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

