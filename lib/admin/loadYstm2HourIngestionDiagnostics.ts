import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type Ystm2HourIngestionDiagnostics = {
  p50PublishHours: number | null
  p95PublishHours: number | null
  hotQueueDepth: number
  coldQueueDepth: number
  warmQueueDepth: number
  over2hCount: number
  oldestHotAgeHours: number | null
  salePhpUnsupportedCount: number
  listFastPublishSuccessCount: number
  listFastPublishFailureCount: number
  slaWithin2hPct: number | null
}

type LatencyRow = {
  publish_latency_hours: number | null
}

export async function loadYstm2HourIngestionDiagnostics(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<Ystm2HourIngestionDiagnostics> {
  const hotCutoff = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

  const [hotCount, warmCount, coldCount, latencyResult, oldestHotResult, unsupportedResult] =
    await Promise.all([
      fromBase(admin, 'ystm_coverage_observations')
        .select('canonical_url', { count: 'exact', head: true })
        .eq('ystm_valid_active', true)
        .eq('lootaura_visible', false)
        .eq('discovery_priority', 'hot'),
      fromBase(admin, 'ystm_coverage_observations')
        .select('canonical_url', { count: 'exact', head: true })
        .eq('ystm_valid_active', true)
        .eq('lootaura_visible', false)
        .eq('discovery_priority', 'warm'),
      fromBase(admin, 'ystm_coverage_observations')
        .select('canonical_url', { count: 'exact', head: true })
        .eq('ystm_valid_active', true)
        .eq('lootaura_visible', false)
        .or('discovery_priority.eq.cold,discovery_priority.is.null'),
      fromBase(admin, 'ystm_discovery_latency_v1')
        .select('publish_latency_hours')
        .eq('ystm_valid_active', true)
        .not('first_published_at', 'is', null)
        .gte('first_list_seen_at', hotCutoff)
        .limit(5000),
      fromBase(admin, 'ystm_coverage_observations')
        .select('first_list_seen_at')
        .eq('ystm_valid_active', true)
        .eq('lootaura_visible', false)
        .in('discovery_priority', ['hot', 'warm'])
        .order('first_list_seen_at', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      fromBase(admin, 'ystm_coverage_observations')
        .select('canonical_url', { count: 'exact', head: true })
        .eq('missing_ingestion_failure_reason', 'sale_php_unsupported'),
    ])

  const latencies = ((latencyResult.data ?? []) as LatencyRow[])
    .map((r) => r.publish_latency_hours)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b)

  const p50 =
    latencies.length === 0
      ? null
      : latencies[Math.floor(latencies.length * 0.5)] ?? null
  const p95 =
    latencies.length === 0
      ? null
      : latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? null
  const over2hCount = latencies.filter((h) => h > 2).length
  const within2h = latencies.filter((h) => h <= 2).length
  const slaWithin2hPct =
    latencies.length === 0 ? null : Math.round((within2h / latencies.length) * 10000) / 100

  const oldestHot = oldestHotResult.data as { first_list_seen_at: string | null } | null
  const oldestHotAgeHours =
    oldestHot?.first_list_seen_at && Number.isFinite(Date.parse(oldestHot.first_list_seen_at))
      ? (nowMs - Date.parse(oldestHot.first_list_seen_at)) / (60 * 60 * 1000)
      : null

  const { count: listFastSuccess } = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url', { count: 'exact', head: true })
    .eq('missing_ingestion_outcome', 'published')
    .in('discovery_priority', ['hot', 'warm'])
    .gte('missing_ingestion_attempted_at', hotCutoff)

  const { count: listFastFailed } = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url', { count: 'exact', head: true })
    .eq('missing_ingestion_outcome', 'failed')
    .in('discovery_priority', ['hot', 'warm'])
    .gte('missing_ingestion_attempted_at', hotCutoff)

  return {
    p50PublishHours: p50,
    p95PublishHours: p95,
    hotQueueDepth: hotCount.count ?? 0,
    warmQueueDepth: warmCount.count ?? 0,
    coldQueueDepth: coldCount.count ?? 0,
    over2hCount,
    oldestHotAgeHours,
    salePhpUnsupportedCount: unsupportedResult.count ?? 0,
    listFastPublishSuccessCount: listFastSuccess ?? 0,
    listFastPublishFailureCount: listFastFailed ?? 0,
    slaWithin2hPct,
  }
}
