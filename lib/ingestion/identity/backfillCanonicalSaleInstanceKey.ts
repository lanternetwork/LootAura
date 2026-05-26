import { computeCanonicalSaleInstanceKey } from '@/lib/ingestion/identity/computeCanonicalSaleInstanceKey'
import { computeEsnetSaleInstanceIdentity } from '@/lib/ingestion/estatesalesnet/computeEsnetSaleInstanceIdentity'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'
import { computeYstmSaleInstanceIdentity } from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import { isEstatesalesNetSourceUrl } from '@/lib/ingestion/estatesalesnet/esnetHosts'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const EXTERNAL_INGEST_PLATFORMS = ['external_page_source', ESNET_SOURCE_PLATFORM] as const

export type BackfillCanonicalSaleInstanceKeyMetrics = {
  processed: number
  rowsBackfilled: number
  skipped: number
  missingDate: number
  missingLocation: number
  missingCanonicalInputs: number
  canonicalCollisionGroups: number
  dryRun: boolean
  batches: number
  lastProcessedId: string | null
}

export type RunBackfillCanonicalSaleInstanceKeyOptions = {
  admin?: ReturnType<typeof getAdminDb>
  batchSize?: number
  dryRun?: boolean
  maxRows?: number
  resumeAfterId?: string | null
  logOperation?: string
}

type IngestedCanonicalBackfillRow = {
  id: string
  source_url: string
  source_platform: string
  state: string | null
  city: string | null
  normalized_address: string | null
  date_start: string | null
  date_end: string | null
  time_start: string | null
  time_end: string | null
  title: string | null
  description: string | null
  lat: number | null
  lng: number | null
  raw_payload: unknown
  source_schedule_hash: string | null
  source_location_hash: string | null
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function rowPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function isSupportedExternalRow(row: IngestedCanonicalBackfillRow): boolean {
  const platform = row.source_platform?.trim() ?? ''
  if (!EXTERNAL_INGEST_PLATFORMS.includes(platform as (typeof EXTERNAL_INGEST_PLATFORMS)[number])) {
    return false
  }
  if (platform === ESNET_SOURCE_PLATFORM) {
    return isEstatesalesNetSourceUrl(row.source_url)
  }
  /**
   * Backfill eligibility should align with Phase A goals (populate canonical keys on active external rows)
   * and must not exclude non-YSTM external marketplace rows that still have stable address + schedule.
   *
   * We keep stricter URL checks for ES.net, but allow all `external_page_source` rows through and let
   * `resolveCanonicalKey` determine whether inputs are sufficient.
   */
  return Boolean(row.source_url?.trim())
}

function resolveCanonicalKey(row: IngestedCanonicalBackfillRow): string | null {
  // Platform-agnostic fallback: address + date window is sufficient to compute the canonical key.
  // This avoids skipping valid external marketplace rows whose URL is not a YSTM detail listing page.
  const directCanonical = computeCanonicalSaleInstanceKey({
    state: row.state,
    city: row.city,
    normalizedAddress: row.normalized_address,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    lat: toNumberOrNull(row.lat),
    lng: toNumberOrNull(row.lng),
    sourceScheduleHash: row.source_schedule_hash,
    sourceLocationHash: row.source_location_hash,
  })
  if (directCanonical) return directCanonical

  if (row.source_schedule_hash?.trim() && row.source_location_hash?.trim()) {
    return computeCanonicalSaleInstanceKey({
      state: row.state,
      city: row.city,
      normalizedAddress: row.normalized_address,
      dateStart: row.date_start,
      dateEnd: row.date_end,
      timeStart: row.time_start,
      timeEnd: row.time_end,
      lat: toNumberOrNull(row.lat),
      lng: toNumberOrNull(row.lng),
      sourceScheduleHash: row.source_schedule_hash,
      sourceLocationHash: row.source_location_hash,
    })
  }

  const platform = row.source_platform?.trim() || 'external_page_source'
  const identityInput = {
    sourcePlatform: platform,
    sourceUrl: row.source_url,
    state: row.state,
    city: row.city,
    normalizedAddress: row.normalized_address,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    title: row.title,
    description: row.description,
    lat: toNumberOrNull(row.lat),
    lng: toNumberOrNull(row.lng),
    rawPayload: rowPayload(row.raw_payload),
  }

  const identity =
    platform === ESNET_SOURCE_PLATFORM
      ? computeEsnetSaleInstanceIdentity(identityInput)
      : computeYstmSaleInstanceIdentity({
          ...identityInput,
          timeStart: row.time_start,
          timeEnd: row.time_end,
        })

  return identity?.canonical_sale_instance_key ?? null
}

/**
 * Phase A: backfill canonical_sale_instance_key on external ingested rows (no ingest/publish behavior change).
 */
export async function runBackfillCanonicalSaleInstanceKey(
  options: RunBackfillCanonicalSaleInstanceKeyOptions = {}
): Promise<BackfillCanonicalSaleInstanceKeyMetrics> {
  const admin = options.admin ?? getAdminDb()
  const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 500)
  const dryRun = options.dryRun === true
  const maxRows =
    options.maxRows != null && options.maxRows > 0 ? options.maxRows : Number.POSITIVE_INFINITY
  const logOp = options.logOperation ?? 'backfill_canonical_sale_instance_key'

  const metrics: BackfillCanonicalSaleInstanceKeyMetrics = {
    processed: 0,
    rowsBackfilled: 0,
    skipped: 0,
    missingDate: 0,
    missingLocation: 0,
    missingCanonicalInputs: 0,
    canonicalCollisionGroups: 0,
    dryRun,
    batches: 0,
    lastProcessedId: null,
  }

  let resumeAfterId = options.resumeAfterId?.trim() || null

  while (metrics.processed < maxRows) {
    let query = fromBase(admin, 'ingested_sales')
      .select(
        'id, source_url, source_platform, state, city, normalized_address, date_start, date_end, time_start, time_end, title, description, lat, lng, raw_payload, source_schedule_hash, source_location_hash'
      )
      .in('source_platform', [...EXTERNAL_INGEST_PLATFORMS])
      .is('canonical_sale_instance_key', null)
      .eq('is_duplicate', false)
      .not('source_url', 'is', null)
      .order('id', { ascending: true })
      .limit(batchSize)

    if (resumeAfterId) {
      query = query.gt('id', resumeAfterId)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const chunk = (data ?? []) as IngestedCanonicalBackfillRow[]
    if (chunk.length === 0) break

    metrics.batches += 1

    for (const row of chunk) {
      if (metrics.processed >= maxRows) break

      metrics.processed += 1
      metrics.lastProcessedId = row.id

      if (!isSupportedExternalRow(row)) {
        metrics.skipped += 1
        continue
      }

      if (!row.date_start?.trim()) metrics.missingDate += 1
      if (!row.normalized_address?.trim()) metrics.missingLocation += 1

      const canonicalKey = resolveCanonicalKey(row)
      if (!canonicalKey) {
        metrics.missingCanonicalInputs += 1
        metrics.skipped += 1
        continue
      }

      if (!dryRun) {
        const { error: updErr } = await fromBase(admin, 'ingested_sales')
          .update({ canonical_sale_instance_key: canonicalKey })
          .eq('id', row.id)
        if (updErr) throw new Error(updErr.message)
      }

      metrics.rowsBackfilled += 1
    }

    resumeAfterId = metrics.lastProcessedId

    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.canonicalSaleInstanceKeyBackfillBatch, {
        operation: logOp,
        batchProcessed: chunk.length,
        rowsBackfilled: metrics.rowsBackfilled,
        processed: metrics.processed,
        dryRun,
      })
    )

    logger.info('canonical_sale_instance_key_backfill_batch', {
      component: 'ingestion/identity/backfillCanonicalSaleInstanceKey',
      operation: logOp,
      batchProcessed: chunk.length,
      ...metrics,
    })

    if (chunk.length < batchSize) break
  }

  metrics.canonicalCollisionGroups = await countCanonicalCollisionGroups(admin)

  logger.info('canonical_sale_instance_key_backfill_complete', {
    component: 'ingestion/identity/backfillCanonicalSaleInstanceKey',
    operation: logOp,
    ...metrics,
  })

  return metrics
}

async function countCanonicalCollisionGroups(admin: ReturnType<typeof getAdminDb>): Promise<number> {
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('canonical_sale_instance_key')
    .in('source_platform', [...EXTERNAL_INGEST_PLATFORMS])
    .not('canonical_sale_instance_key', 'is', null)
    .is('superseded_by_ingested_sale_id', null)
    .eq('is_duplicate', false)
    .limit(5000)

  if (error) throw new Error(error.message)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const key = (row as { canonical_sale_instance_key?: string }).canonical_sale_instance_key
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.values()].filter((n) => n > 1).length
}
