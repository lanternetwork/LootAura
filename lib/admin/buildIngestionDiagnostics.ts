import { buildNeedsCheckRootCauseDiagnostics } from '@/lib/admin/buildNeedsCheckRootCauseDiagnostics'
import { evaluateNeedsCheckRootCauseDiscovery } from '@/lib/admin/evaluateNeedsCheckRootCauseDiscovery'
import { buildYstmIngestionRepairDiagnostics } from '@/lib/admin/buildYstmIngestionRepairDiagnostics'
import { buildYstmCoverageDiagnostics } from '@/lib/admin/buildYstmCoverageDiagnostics'
import { buildYstmStabilizationDiagnostics } from '@/lib/admin/buildYstmStabilizationDiagnostics'
import type { IngestionFunnelStage, IngestionFunnelStageId } from '@/lib/admin/ingestionFunnelMetricsHelpers'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { DETAIL_FIRST_SUCCESS_RATE_TARGET } from '@/lib/ingestion/acquisition/detailFirstOperationalHealth'
import {
  CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING,
  CRAWL_SKIP_TAXONOMY_MIN_SAMPLES,
} from '@/lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth'
import { EXTERNAL_CRAWL_SKIP_SUB_REASONS } from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import type { DetailFirstProofCheck } from '@/lib/ingestion/acquisition/detailFirstProofProtocol'
import { YSTM_DETAIL_FIRST_FALLBACK_REASON_ORDER } from '@/lib/ingestion/acquisition/ystmDetailFirstFallbackReasons'

export type BuildIngestionDiagnosticsOptions = {
  /** e.g. production, preview, development, or hostname */
  environment?: string
  /** ISO timestamp for the export header; defaults to metrics.generatedAt */
  copiedAt?: string
  /** When set, appends external marketplace coverage scoreboard + week-1 sprint gates. */
  ystmCoverage?: YstmCoverageMetricsResponse | null
}

function stageCount(stages: IngestionFunnelStage[], id: IngestionFunnelStageId): number {
  return stages.find((s) => s.id === id)?.count ?? 0
}

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return n.toLocaleString('en-US')
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  return `${Math.round(ms).toLocaleString('en-US')} ms`
}

function providerPressureState(
  bottleneck: string,
  rate429Count24h: number
): string {
  if (bottleneck === 'db_provider_pressure') {
    return 'active (db_provider_pressure)'
  }
  if (rate429Count24h > 0) {
    return `elevated (429 count 24h: ${formatCount(rate429Count24h)})`
  }
  return 'normal'
}

function bullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? formatCount(value) : value}`
}

function proofCheckBullet(check: DetailFirstProofCheck): string {
  const mark = check.pass ? 'PASS' : 'FAIL'
  const req = check.required ? 'required' : 'advisory'
  return `- [${mark}] ${check.label} (${req}): ${check.actual} (threshold: ${check.threshold})`
}

/**
 * Serialize loaded ingestion dashboard metrics as markdown for clipboard / debugging.
 */
export function buildIngestionDiagnostics(
  data: IngestionMetricsResponse,
  options: BuildIngestionDiagnosticsOptions = {}
): string {
  const funnel = data.funnel['24h']
  const stages = funnel.stages
  const vol = data.volume
  const df = funnel.detailFirst
  const ystm = funnel.ystm
  const hourly = vol.hourlyRates
  const timestamp = options.copiedAt ?? data.generatedAt ?? new Date().toISOString()
  const environment = options.environment ?? 'unknown'

  const duplicateSkipped = stageCount(stages, 'duplicate_skipped')

  const lines: string[] = [
    '# Ingestion Diagnostics',
    '',
    `Timestamp: ${timestamp}`,
    `Environment: ${environment}`,
    `Current bottleneck: ${vol.bottleneck}`,
    bullet(
      'detail-first metrics baseline',
      data.detailFirstMetricsBaselineAt ?? 'not set (full 24h/7d windows)'
    ),
    bullet('metrics generated at', data.generatedAt),
    '',
    '## Live backlog',
    bullet('ingested_sales backlog', data.backlog),
    bullet('geocode eligible backlog', data.geocodeEligibleBacklog),
    bullet('published (24h)', data.published24h),
    bullet('claimed (24h)', data.claimed24h),
    '',
    '## Funnel (24h)',
    bullet('discovered', stageCount(stages, 'discovered')),
    bullet('duplicate/skipped', duplicateSkipped),
    bullet('skipped expired', funnel.skippedExpired),
    bullet('inserted', stageCount(stages, 'inserted')),
    bullet('fresh inserted', funnel.freshInserted),
    bullet('published', stageCount(stages, 'published')),
    bullet('publish failed', stageCount(stages, 'publish_failed')),
    '',
    '## Phase 2 — crawl skip taxonomy (24h)',
    bullet(
      'classified skips',
      vol.fetch.crawlSkipTaxonomy24h?.total ?? 0
    ),
    bullet('benign', vol.fetch.crawlSkipTaxonomy24h?.benign ?? 0),
    bullet('suspicious', vol.fetch.crawlSkipTaxonomy24h?.suspicious ?? 0),
    bullet('operational', vol.fetch.crawlSkipTaxonomy24h?.operational ?? 0),
    bullet(
      'suspicious share',
      formatPct(vol.fetch.crawlSkipTaxonomy24h?.suspiciousShare ?? null)
    ),
    bullet(
      'alert threshold',
      `≥${(CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING * 100).toFixed(0)}% suspicious when n≥${CRAWL_SKIP_TAXONOMY_MIN_SAMPLES}`
    ),
    '',
    '### Crawl skip sub-reasons (top)',
  ]

  const crawlSubReasons = EXTERNAL_CRAWL_SKIP_SUB_REASONS.map((r) => ({
    reason: r,
    count: vol.fetch.crawlSkipTaxonomy24h?.subReasons?.[r] ?? 0,
  }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
  if (crawlSubReasons.length === 0) {
    lines.push(bullet('(none)', '—'))
  } else {
    for (const row of crawlSubReasons) {
      lines.push(bullet(row.reason, formatCount(row.count)))
    }
  }

  if ((vol.fetch.crawlSkipTaxonomyAlerts ?? []).length > 0) {
    lines.push('', '### Crawl skip taxonomy alerts')
    for (const alert of vol.fetch.crawlSkipTaxonomyAlerts ?? []) {
      lines.push(bullet(`${alert.level}: ${alert.code}`, alert.message))
    }
  }

  lines.push(
    '',
    '## Phase 3B proof protocol',
    bullet('status', data.detailFirstProof.status),
    bullet('passed', data.detailFirstProof.passed ? 'yes' : 'no'),
    bullet('window', data.detailFirstProof.windowLabel),
    bullet('summary', data.detailFirstProof.summary),
    '',
    '### Proof checklist'
  )

  for (const check of data.detailFirstProof.checks) {
    lines.push(proofCheckBullet(check))
  }

  const capture = funnel.detailFirstCapture
  lines.push(
    '',
    '## Phase G — crawl volume (parser vs visible capture)',
    bullet('crawler discovered', capture.crawlerDiscovered),
    bullet('detail-first ready', capture.detailFirstReady),
    bullet('fresh inserted', capture.freshInserted),
    bullet('parser success rate', formatPct(capture.parserSuccessRate)),
    bullet('visible capture rate', formatPct(capture.visibleCaptureRate)),
    bullet('parser − visible gap', formatPct(capture.parserToVisibleGapRate)),
    bullet(
      'parser SLO met, visible capture low',
      capture.parserSloMetVisibleCaptureLow ? 'yes' : 'no'
    ),
    '',
    '## Phase 3B',
    bullet('attempted', df.attempted),
    bullet('ready at insert', df.succeeded),
    bullet('published same run', df.published),
    bullet('fallback to legacy', df.fallback),
    bullet('detail fetch failed', df.fetchFailed),
    bullet(
      'detail-first success rate',
      `${formatPct(df.providerGeocodeBypassRate)} (target ≥${(DETAIL_FIRST_SUCCESS_RATE_TARGET * 100).toFixed(0)}%)`
    ),
    bullet('address from detail page', formatCount(df.addressFromDetailPage)),
    bullet('address from list seed', formatCount(df.addressFromListSeed)),
    bullet('address from detail page rate', formatPct(df.addressFromDetailPageRate)),
    bullet('median ms to publish', formatMs(df.medianMsToPublished)),
    bullet(
      'operational health',
      df.operationalHealth.healthy
        ? 'healthy'
        : `${df.operationalHealth.alerts.length} alert(s)`
    ),
    bullet(
      'top fallback reason',
      df.topFallbackReason != null
        ? `${df.topFallbackReason} (${formatPct(df.topFallbackReasonPct)} of attempts)`
        : '—'
    ),
    bullet(
      'fallback reasons accounted',
      df.fallback > 0
        ? `${formatCount(df.fallbackReasonAccounted)}/${formatCount(df.fallback)}`
        : '—'
    ),
    ...(df.fallbackUnclassified > 0
      ? [
          bullet(
            'fallback_unclassified (needs code path)',
            formatCount(df.fallbackUnclassified)
          ),
        ]
      : []),
    '',
    '### Detail-first operational alerts',
  )

  if (df.operationalHealth.alerts.length === 0) {
    lines.push(bullet('(none)', '—'))
  } else {
    for (const alert of df.operationalHealth.alerts) {
      lines.push(bullet(`${alert.level}: ${alert.code}`, alert.message))
    }
  }

  lines.push('', '### Phase 3B fallback reasons')

  const fallbackReasonRows = [
    ...YSTM_DETAIL_FIRST_FALLBACK_REASON_ORDER.filter(
      (r) => (df.fallbackByReason[r] ?? 0) > 0
    ),
    ...Object.keys(df.fallbackByReason).filter(
      (r) =>
        !YSTM_DETAIL_FIRST_FALLBACK_REASON_ORDER.includes(
          r as (typeof YSTM_DETAIL_FIRST_FALLBACK_REASON_ORDER)[number]
        ) && (df.fallbackByReason[r] ?? 0) > 0
    ),
  ]
  if (fallbackReasonRows.length === 0) {
    lines.push(bullet('(none)', '—'))
  } else {
    for (const reason of fallbackReasonRows) {
      const count = df.fallbackByReason[reason] ?? 0
      const rate = df.attempted > 0 ? count / df.attempted : null
      lines.push(
        bullet(
          reason,
          `${formatCount(count)} (${formatPct(rate)} of attempts)`
        )
      )
    }
  }

  const insertFailedCodes = Object.entries(df.insertFailedByDbCode ?? {}).filter(
    ([, count]) => count > 0
  )
  lines.push('', '### Phase C insert_failed DB codes')
  if (insertFailedCodes.length === 0) {
    lines.push(bullet('(none)', '—'))
  } else {
    for (const [code, count] of insertFailedCodes.sort((a, b) => b[1] - a[1])) {
      const rate = df.attempted > 0 ? count / df.attempted : null
      lines.push(
        bullet(
          code,
          `${formatCount(count)} (${formatPct(rate)} of attempts)`
        )
      )
    }
  }

  lines.push(
    '',
    '## Queues',
    bullet('needs_geocode', vol.geocode.needsGeocodeCount),
    bullet('geocode eligible', data.geocodeEligibleBacklog),
    bullet('needs_check', data.failureBreakdown.needs_check),
    bullet('address enrichment backlog', vol.addressLifecycle.enrichmentBacklog),
    bullet('image backlog', vol.imageEnrichment.backlog),
    '',
    '## Geocode',
    bullet('geocode touches 24h', data.geocodeTouches24h),
    bullet('native coord found', stageCount(stages, 'native_coord_found')),
    bullet('native coord failed', stageCount(stages, 'native_coord_failed')),
    bullet('geocode success', stageCount(stages, 'geocode_success')),
    bullet('geocode failed', stageCount(stages, 'geocode_failed')),
    bullet(
      'provider pressure state',
      providerPressureState(vol.bottleneck, vol.geocode.rate429Count24h)
    ),
    '',
    '## Acquisition',
    bullet('inserted/hr', hourly.listingsInsertedPerHour),
    bullet('insert yield', formatPct(vol.fetch.insertYield24h)),
    bullet('saturation', formatPct(vol.fetch.saturationRate24h)),
    bullet('validated configs', vol.acquisition.validatedDiscoveryConfigs),
    bullet('pending configs', vol.acquisition.pendingDiscoveryConfigs),
    bullet('crawlable configs', vol.acquisition.crawlableConfigs),
    '',
    '## External source breakdown',
    bullet('discovered', ystm.discovered),
    bullet('duplicate/skipped', ystm.duplicate_skipped),
    bullet('inserted', ystm.inserted),
    bullet('unique canonical URLs', ystm.uniqueCanonicalUrls),
    bullet('published', ystm.published),
    '',
    '## Top Dropoff'
  )

  if (funnel.topDropoff) {
    const d = funnel.topDropoff
    lines.push(
      bullet('stage', `${d.fromStageId} → ${d.toStageId}`),
      bullet('count', d.count),
      bullet('percentage', formatPct(d.rate))
    )
  } else {
    lines.push(
      bullet('stage', '—'),
      bullet('count', 0),
      bullet('percentage', '—')
    )
  }

  lines.push(
    '',
    '## Hourly',
    bullet('discovered/hour', hourly.listingsDiscoveredPerHour),
    bullet('inserted/hour', hourly.listingsInsertedPerHour),
    bullet('published/hour', hourly.publishSucceededPerHour)
  )

  if (options.ystmCoverage?.ok) {
    lines.push('', buildYstmCoverageDiagnostics(options.ystmCoverage))
    lines.push('', buildYstmStabilizationDiagnostics(data, options.ystmCoverage))
    lines.push('', buildYstmIngestionRepairDiagnostics(data, options.ystmCoverage))
    if (data.needsCheckRootCauseAnalysis) {
      const discovery = evaluateNeedsCheckRootCauseDiscovery(
        data.needsCheckRootCauseAnalysis,
        data,
        options.ystmCoverage,
        data.generatedAt
      )
      lines.push('', buildNeedsCheckRootCauseDiagnostics(discovery, data.needsCheckBreakdown))
    }
  }

  return lines.join('\n')
}
