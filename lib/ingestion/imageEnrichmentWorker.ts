import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { applyDetailPageImageEnrichment } from '@/lib/ingestion/images/applyDetailPageImageEnrichment'
import { shouldSkipRedundantDetailImageFetch } from '@/lib/ingestion/images/ingestedImageEnrichmentDetails'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export const MAX_IMAGE_ENRICHMENT_ATTEMPTS = 5 as const

export type ImageEnrichmentFailureReason =
  | 'not_ystm_detail'
  | 'fetch_failed'
  | 'fetch_blocked'
  | 'fetch_rate_limited'
  | 'not_found'
  | 'no_media_str'
  | 'no_valid_urls'
  | 'max_attempts_exceeded'

export type ImageEnrichmentWorkerSummary = {
  claimed: number
  attempted: number
  updated: number
  skippedUnchanged: number
  skippedRecentDetailAttempt: number
  failedRetriable: number
  failedTerminal: number
  mediaStrFound: number
  mediaStrMissing: number
  byFailureReason: Partial<Record<ImageEnrichmentFailureReason, number>>
}

interface ClaimedImageEnrichmentRow {
  id: string
  source_platform: string
  canonical_source_url: string | null
  source_url: string
  city: string | null
  state: string | null
  image_enrichment_attempts: number
  image_source_url: string | null
  failure_reasons: unknown
  failure_details: unknown
  raw_payload: unknown
}

function parseBatchSize(): number {
  const raw = process.env.IMAGE_ENRICHMENT_BACKLOG_BATCH_SIZE
  const n = raw != null ? Number.parseInt(String(raw), 10) : 25
  if (!Number.isFinite(n) || n < 1) return 25
  return Math.min(n, 100)
}

function isBlockedOrCaptchaHtml(html: string): boolean {
  const sample = html.slice(0, 8000).toLowerCase()
  return (
    sample.includes('captcha') ||
    sample.includes('cf-browser-verification') ||
    sample.includes('attention required') ||
    sample.includes('access denied') ||
    sample.includes('rate limit')
  )
}

function classifyFetchFailure(error: unknown): ImageEnrichmentFailureReason {
  const msg = error instanceof Error ? error.message : String(error)
  if (/http_error:\s*404/i.test(msg)) return 'not_found'
  if (msg.includes('http_error') && /403|429/.test(msg)) {
    return msg.includes('429') ? 'fetch_rate_limited' : 'fetch_blocked'
  }
  if (msg.includes('429')) return 'fetch_rate_limited'
  return 'fetch_failed'
}

async function persistImageFailureReason(
  admin: ReturnType<typeof getAdminDb>,
  rowId: string,
  reason: ImageEnrichmentFailureReason
): Promise<void> {
  await fromBase(admin, 'ingested_sales')
    .update({ image_enrichment_failure_reason: reason })
    .eq('id', rowId)
}

async function processImageEnrichmentRow(
  admin: ReturnType<typeof getAdminDb>,
  row: ClaimedImageEnrichmentRow,
  cooldownMinutes: number,
  telemetryContext?: Record<string, unknown>
): Promise<{
  outcome: 'updated' | 'skipped' | 'skipped_recent_detail' | 'retriable' | 'terminal'
  reason?: ImageEnrichmentFailureReason
  mediaStrFound?: boolean
}> {
  const rowId = row.id
  const attemptCount = row.image_enrichment_attempts

  if (!isYstmDetailListingUrl(row.source_url)) {
    await persistImageFailureReason(admin, rowId, 'not_ystm_detail')
    return { outcome: 'terminal', reason: 'not_ystm_detail' }
  }

  if (shouldSkipRedundantDetailImageFetch(row.failure_details, cooldownMinutes)) {
    return { outcome: 'skipped_recent_detail' }
  }

  let html: string
  try {
    html = await fetchSafeExternalPageHtml(row.source_url, {
      city: row.city ?? 'Unknown',
      state: row.state ?? 'ZZ',
      pageIndex: 0,
      adapter: 'image_enrichment_d2_5',
    })
  } catch (e) {
    const reason = classifyFetchFailure(e)
    const terminal = attemptCount >= MAX_IMAGE_ENRICHMENT_ATTEMPTS || reason === 'not_found'
    await persistImageFailureReason(admin, rowId, terminal ? 'max_attempts_exceeded' : reason)
    return { outcome: terminal ? 'terminal' : 'retriable', reason }
  }

  if (isBlockedOrCaptchaHtml(html)) {
    await persistImageFailureReason(admin, rowId, 'fetch_blocked')
    return {
      outcome: attemptCount >= MAX_IMAGE_ENRICHMENT_ATTEMPTS ? 'terminal' : 'retriable',
      reason: 'fetch_blocked',
    }
  }

  const applyResult = await applyDetailPageImageEnrichment({
    rowId,
    sourceUrl: row.source_url,
    html,
    existingImageSourceUrl: row.image_source_url,
    existingRawPayload: row.raw_payload,
    existingFailureDetails: row.failure_details,
    attemptCount,
    detailAttemptSource: 'image_enrichment',
    telemetryContext,
    city: row.city,
    state: row.state,
  })

  if (applyResult.updated) {
    await fromBase(admin, 'ingested_sales')
      .update({ image_enrichment_failure_reason: null })
      .eq('id', rowId)
    return { outcome: 'updated', mediaStrFound: applyResult.mediaStrFound }
  }

  if (applyResult.skipReason === 'no_media_str') {
    await persistImageFailureReason(admin, rowId, 'no_media_str')
    return {
      outcome: attemptCount >= MAX_IMAGE_ENRICHMENT_ATTEMPTS ? 'terminal' : 'retriable',
      reason: 'no_media_str',
      mediaStrFound: false,
    }
  }

  if (applyResult.skipReason === 'no_valid_urls') {
    await persistImageFailureReason(admin, rowId, 'no_valid_urls')
    return {
      outcome: attemptCount >= MAX_IMAGE_ENRICHMENT_ATTEMPTS ? 'terminal' : 'retriable',
      reason: 'no_valid_urls',
      mediaStrFound: true,
    }
  }

  return {
    outcome: 'skipped',
    mediaStrFound: applyResult.mediaStrFound,
  }
}

export async function enrichPendingImages(options?: {
  batchSizeOverride?: number
  cooldownMinutesOverride?: number
  telemetryContext?: Record<string, unknown>
}): Promise<ImageEnrichmentWorkerSummary> {
  const admin = getAdminDb()
  const batchSize =
    typeof options?.batchSizeOverride === 'number' && options.batchSizeOverride > 0
      ? Math.min(Math.floor(options.batchSizeOverride), 100)
      : parseBatchSize()
  const cooldownMinutes =
    typeof options?.cooldownMinutesOverride === 'number' && options.cooldownMinutesOverride >= 0
      ? Math.min(Math.floor(options.cooldownMinutesOverride), 60)
      : 15

  const summary: ImageEnrichmentWorkerSummary = {
    claimed: 0,
    attempted: 0,
    updated: 0,
    skippedUnchanged: 0,
    skippedRecentDetailAttempt: 0,
    failedRetriable: 0,
    failedTerminal: 0,
    mediaStrFound: 0,
    mediaStrMissing: 0,
    byFailureReason: {},
  }

  const { data, error } = await (admin as any).rpc('claim_ingested_sales_for_image_enrichment', {
    p_batch_size: batchSize,
    p_cooldown_minutes: cooldownMinutes,
  })

  if (error) {
    logger.error('Failed to claim rows for image enrichment', new Error(error.message), {
      component: 'ingestion/imageEnrichmentWorker',
      operation: 'claim_rows',
      batchSize,
    })
    throw new Error(error.message)
  }

  const claimed = (Array.isArray(data) ? data : []) as ClaimedImageEnrichmentRow[]
  summary.claimed = claimed.length

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.imageEnrichmentBatchStarted, {
      ...(options?.telemetryContext ?? {}),
      batchSize,
      claimed: summary.claimed,
    })
  )

  for (const row of claimed) {
    summary.attempted += 1
    const result = await processImageEnrichmentRow(admin, row, cooldownMinutes, options?.telemetryContext)
    if (result.reason) {
      summary.byFailureReason[result.reason] = (summary.byFailureReason[result.reason] ?? 0) + 1
    }
    if (result.mediaStrFound) summary.mediaStrFound += 1
    else if (result.outcome !== 'skipped') summary.mediaStrMissing += 1

    if (result.outcome === 'updated') summary.updated += 1
    else if (result.outcome === 'skipped_recent_detail') summary.skippedRecentDetailAttempt += 1
    else if (result.outcome === 'skipped') summary.skippedUnchanged += 1
    else if (result.outcome === 'terminal') summary.failedTerminal += 1
    else summary.failedRetriable += 1
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.imageEnrichmentBatchCompleted, {
      ...(options?.telemetryContext ?? {}),
      ...summary,
    })
  )

  logger.info('Image enrichment batch completed', {
    component: 'ingestion/imageEnrichmentWorker',
    operation: 'batch_complete',
    ...summary,
  })

  return summary
}
