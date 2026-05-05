import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'

export const dynamic = 'force-dynamic'

const HOURS = 48

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

function hourFloorUtc(iso: string): string {
  const d = new Date(iso)
  d.setUTCMinutes(0, 0, 0)
  d.setUTCMilliseconds(0)
  return d.toISOString()
}

function buildEmptyHourBuckets(hours: number): Map<string, number> {
  const map = new Map<string, number>()
  const now = Date.now()
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now - i * 3600000)
    d.setUTCMinutes(0, 0, 0)
    d.setUTCMilliseconds(0)
    map.set(d.toISOString(), 0)
  }
  return map
}

function mapToSortedSeries(m: Map<string, number>): Array<{ bucket: string; count: number }> {
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, count]) => ({ bucket, count }))
}

function mapToSortedDurationAvg(
  sumByHour: Map<string, number>,
  countByHour: Map<string, number>
): Array<{ bucket: string; value: number }> {
  return [...sumByHour.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, sumMs]) => {
      const n = countByHour.get(bucket) ?? 0
      return { bucket, value: n > 0 ? Math.round(sumMs / n) : 0 }
    })
}

async function fetchAllRows<T extends Record<string, unknown>>(
  admin: ReturnType<typeof getAdminDb>,
  table: string,
  select: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder chain
  filter: (q: any) => any
): Promise<T[]> {
  const pageSize = 1000
  let from = 0
  const out: T[] = []
  for (;;) {
    const base = filter(fromBase(admin, table).select(select))
    const { data, error } = await base.range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data || []) as T[]
    out.push(...chunk)
    if (chunk.length < pageSize) {
      break
    }
    from += pageSize
  }
  return out
}

export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  const admin = getAdminDb()
  const now = new Date()
  const iso24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const iso48h = new Date(now.getTime() - HOURS * 60 * 60 * 1000).toISOString()

  try {
    const statusTargets = [
      'needs_geocode',
      'needs_check',
      'ready',
      'publishing',
      'published',
      'publish_failed',
      'rejected',
    ] as const

    const statusCountPromises = statusTargets.map(async (status) => {
      const { count, error } = await fromBase(admin, 'ingested_sales')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
      if (error) {
        throw new Error(error.message)
      }
      return { status, count: count ?? 0 }
    })

    const published24hPromise = fromBase(admin, 'sales')
      .select('id', { count: 'exact', head: true })
      .not('ingested_sale_id', 'is', null)
      .gte('created_at', iso24h)

    const runs24hPromise = fetchAllRows<{ created_count: number | null }>(
      admin,
      'ingestion_runs',
      'created_count',
      (q) => q.gte('started_at', iso24h)
    )

    const geocodeTouchesPromise = fromBase(admin, 'ingested_sales')
      .select('id', { count: 'exact', head: true })
      .gte('last_geocode_attempt_at', iso24h)

    const stuckRowsPromise = fromBase(admin, 'ingested_sales')
      .select(
        'id, status, city, state, geocode_attempts, created_at, updated_at, last_geocode_attempt_at, source_url'
      )
      .in('status', ['needs_geocode', 'ready', 'publishing', 'publish_failed'])
      .order('updated_at', { ascending: true })
      .limit(20)

    const salesTsPromise = fetchAllRows<{ created_at: string }>(
      admin,
      'sales',
      'created_at',
      (q) => q.not('ingested_sale_id', 'is', null).gte('created_at', iso48h)
    )

    const ingestedPubTsPromise = fetchAllRows<{ published_at: string | null }>(
      admin,
      'ingested_sales',
      'published_at',
      (q) => q.not('published_at', 'is', null).gte('published_at', iso48h)
    )

    const orchestrationRowsPromise = fetchAllRows<{
      created_at: string
      duration_ms: number
      rate_429_count: number
      claimed_count: number
      geocode_succeeded_count: number
      publish_succeeded_count: number
    }>(admin, 'ingestion_orchestration_runs', 'created_at, duration_ms, rate_429_count, claimed_count, geocode_succeeded_count, publish_succeeded_count', (q) =>
      q.gte('created_at', iso48h)
    )

    const [
      statusParts,
      published24hResult,
      runs24h,
      geocodeTouchesResult,
      stuckResult,
      salesTs,
      ingestedPubTs,
      orchRows,
    ] = await Promise.all([
      Promise.all(statusCountPromises),
      published24hPromise,
      runs24hPromise,
      geocodeTouchesPromise,
      stuckRowsPromise,
      salesTsPromise,
      ingestedPubTsPromise,
      orchestrationRowsPromise,
    ])

    const statusMap = Object.fromEntries(statusParts.map((p) => [p.status, p.count])) as Record<
      (typeof statusTargets)[number],
      number
    >

    const backlog = statusMap.needs_geocode
    if (published24hResult.error) {
      throw new Error(published24hResult.error.message)
    }
    const published24h = published24hResult.count ?? 0

    const claimed24h = runs24h.reduce((a, r) => a + (r.created_count ?? 0), 0)
    if (geocodeTouchesResult.error) {
      throw new Error(geocodeTouchesResult.error.message)
    }
    const geocodeTouches24h = geocodeTouchesResult.count ?? 0

    const efficiency =
      claimed24h > 0 ? Math.round((published24h / claimed24h) * 1000) / 1000 : null

    const failureBreakdown = {
      needs_check: statusMap.needs_check,
      publish_failed: statusMap.publish_failed,
      ready: statusMap.ready,
      publishing: statusMap.publishing,
    }

    const publishedByHour = buildEmptyHourBuckets(HOURS)
    for (const row of salesTs) {
      if (!row.created_at) continue
      const k = hourFloorUtc(row.created_at)
      if (publishedByHour.has(k)) {
        publishedByHour.set(k, (publishedByHour.get(k) ?? 0) + 1)
      }
    }

    const ingestedPublishedByHour = buildEmptyHourBuckets(HOURS)
    for (const row of ingestedPubTs) {
      if (!row.published_at) continue
      const k = hourFloorUtc(row.published_at)
      if (ingestedPublishedByHour.has(k)) {
        ingestedPublishedByHour.set(k, (ingestedPublishedByHour.get(k) ?? 0) + 1)
      }
    }

    const durationSumByHour = buildEmptyHourBuckets(HOURS)
    const durationCountByHour = buildEmptyHourBuckets(HOURS)
    const rate429ByHourMap = buildEmptyHourBuckets(HOURS)
    const claimedByHour = buildEmptyHourBuckets(HOURS)
    const geocodeSuccessByHour = buildEmptyHourBuckets(HOURS)
    const publishSuccessByHour = buildEmptyHourBuckets(HOURS)

    for (const row of orchRows) {
      if (!row.created_at) continue
      const k = hourFloorUtc(row.created_at)
      if (!durationSumByHour.has(k)) continue
      durationSumByHour.set(k, (durationSumByHour.get(k) ?? 0) + row.duration_ms)
      durationCountByHour.set(k, (durationCountByHour.get(k) ?? 0) + 1)
      rate429ByHourMap.set(k, (rate429ByHourMap.get(k) ?? 0) + row.rate_429_count)
      claimedByHour.set(k, (claimedByHour.get(k) ?? 0) + row.claimed_count)
      geocodeSuccessByHour.set(k, (geocodeSuccessByHour.get(k) ?? 0) + row.geocode_succeeded_count)
      publishSuccessByHour.set(k, (publishSuccessByHour.get(k) ?? 0) + row.publish_succeeded_count)
    }

    const durationMsByHour = mapToSortedDurationAvg(durationSumByHour, durationCountByHour)
    const rate429ByHourSeries = mapToSortedSeries(rate429ByHourMap)

    if (stuckResult.error) {
      throw new Error(stuckResult.error.message)
    }
    const stuckRows = stuckResult.data || []

    const body: IngestionMetricsResponse = {
      ok: true,
      generatedAt: now.toISOString(),
      backlog,
      published24h,
      claimed24h,
      geocodeTouches24h,
      efficiency,
      failureBreakdown,
      timeseries: {
        publishedByHour: mapToSortedSeries(publishedByHour),
        ingestedPublishedByHour: mapToSortedSeries(ingestedPublishedByHour),
        durationMsByHour,
        rate429ByHour: rate429ByHourSeries,
        claimedByHour: mapToSortedSeries(claimedByHour),
        geocodeSuccessByHour: mapToSortedSeries(geocodeSuccessByHour),
        publishSuccessByHour: mapToSortedSeries(publishSuccessByHour),
      },
      oldestStuckRows: stuckRows.map((r) => ({
        id: r.id as string,
        status: r.status as string,
        city: (r.city as string | null) ?? null,
        state: (r.state as string | null) ?? null,
        geocode_attempts: (r.geocode_attempts as number | null) ?? null,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        last_geocode_attempt_at: (r.last_geocode_attempt_at as string | null) ?? null,
        source_url: r.source_url as string,
      })),
    }

    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('admin ingestion metrics failed', err instanceof Error ? err : new Error(message), {
      component: 'api/admin/ingestion/metrics',
    })
    return jsonError(500, 'METRICS_FAILED', message)
  }
}
