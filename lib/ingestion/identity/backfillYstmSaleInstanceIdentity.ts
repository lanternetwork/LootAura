import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import {
  computeYstmSaleInstanceIdentity,
  saleInstanceIdentityDbColumns,
} from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import { recordIngestedSaleSourceUrl } from '@/lib/ingestion/identity/recordIngestedSaleSourceUrl'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type BackfillYstmSaleInstanceIdentityMetrics = {
  processed: number
  rowsBackfilled: number
  aliasesRecorded: number
  skipped: number
  missingDate: number
  missingLocation: number
  keyCollisions: number
  urlReuseConflicts: number
  ambiguousRows: number
  batches: number
  dryRun: boolean
  lastProcessedId: string | null
}

export type RunBackfillYstmSaleInstanceIdentityOptions = {
  admin?: ReturnType<typeof getAdminDb>
  batchSize?: number
  dryRun?: boolean
  maxRows?: number
  resumeAfterId?: string | null
  logOperation?: string
}

type IngestedBackfillRow = {
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
  superseded_by_ingested_sale_id: string | null
  sale_instance_key: string | null
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

export function assessYstmBackfillRowQuality(row: IngestedBackfillRow): {
  missingDate: boolean
  missingLocation: boolean
} {
  const missingDate = !row.date_start?.trim() && !row.date_end?.trim()
  const missingLocation = !row.normalized_address?.trim()
  return { missingDate, missingLocation }
}

async function activeKeyOwnerId(
  admin: ReturnType<typeof getAdminDb>,
  sourcePlatform: string,
  saleInstanceKey: string,
  excludeId: string
): Promise<string | null> {
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id')
    .eq('source_platform', sourcePlatform)
    .eq('sale_instance_key', saleInstanceKey)
    .is('superseded_by_ingested_sale_id', null)
    .neq('id', excludeId)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.id ? String(data.id) : null
}

function countUrlReuseConflicts(rows: IngestedBackfillRow[]): number {
  const byCanonical = new Map<string, number>()
  for (const row of rows) {
    if (row.superseded_by_ingested_sale_id) continue
    const canon = canonicalSourceUrl(row.source_url)
    byCanonical.set(canon, (byCanonical.get(canon) ?? 0) + 1)
  }
  let conflicts = 0
  for (const count of byCanonical.values()) {
    if (count > 1) conflicts += count - 1
  }
  return conflicts
}

/**
 * Phase 12: backfill sale-instance identity columns and URL alias rows for YSTM ingested_sales.
 */
export async function runBackfillYstmSaleInstanceIdentity(
  options: RunBackfillYstmSaleInstanceIdentityOptions = {}
): Promise<BackfillYstmSaleInstanceIdentityMetrics> {
  const admin = options.admin ?? getAdminDb()
  const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 500)
  const dryRun = options.dryRun === true
  const maxRows =
    options.maxRows != null && options.maxRows > 0 ? options.maxRows : Number.POSITIVE_INFINITY
  const logOp = options.logOperation ?? 'backfill_ystm_sale_instance_identity'

  const metrics: BackfillYstmSaleInstanceIdentityMetrics = {
    processed: 0,
    rowsBackfilled: 0,
    aliasesRecorded: 0,
    skipped: 0,
    missingDate: 0,
    missingLocation: 0,
    keyCollisions: 0,
    urlReuseConflicts: 0,
    ambiguousRows: 0,
    batches: 0,
    dryRun,
    lastProcessedId: null,
  }

  let resumeAfterId = options.resumeAfterId?.trim() || null

  while (metrics.processed < maxRows) {
    let query = fromBase(admin, 'ingested_sales')
      .select(
        'id, source_url, source_platform, state, city, normalized_address, date_start, date_end, time_start, time_end, title, description, lat, lng, raw_payload, superseded_by_ingested_sale_id, sale_instance_key'
      )
      .eq('is_duplicate', false)
      .is('sale_instance_key', null)
      .not('source_url', 'is', null)
      .order('id', { ascending: true })
      .limit(batchSize)

    if (resumeAfterId) {
      query = query.gt('id', resumeAfterId)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const chunk = (data ?? []) as IngestedBackfillRow[]
    if (chunk.length === 0) break

    metrics.batches += 1
    metrics.urlReuseConflicts += countUrlReuseConflicts(chunk)

    const keysClaimedInBatch = new Map<string, string>()

    for (const row of chunk) {
      if (metrics.processed >= maxRows) break

      metrics.processed += 1
      metrics.lastProcessedId = row.id

      if (!isYstmDetailListingUrl(row.source_url)) {
        metrics.skipped += 1
        continue
      }

      const quality = assessYstmBackfillRowQuality(row)
      if (quality.missingDate) metrics.missingDate += 1
      if (quality.missingLocation) metrics.missingLocation += 1

      const identity = computeYstmSaleInstanceIdentity({
        sourcePlatform: row.source_platform?.trim() || 'external_page_source',
        sourceUrl: row.source_url,
        state: row.state,
        city: row.city,
        normalizedAddress: row.normalized_address,
        dateStart: row.date_start,
        dateEnd: row.date_end,
        timeStart: row.time_start,
        timeEnd: row.time_end,
        title: row.title,
        description: row.description,
        lat: toNumberOrNull(row.lat),
        lng: toNumberOrNull(row.lng),
        rawPayload: rowPayload(row.raw_payload),
      })

      if (!identity?.sale_instance_key) {
        metrics.ambiguousRows += 1
        metrics.skipped += 1
        continue
      }

      const platform = row.source_platform?.trim() || 'external_page_source'
      const key = identity.sale_instance_key
      const isActive = !row.superseded_by_ingested_sale_id

      if (isActive) {
        const batchOwner = keysClaimedInBatch.get(key)
        if (batchOwner && batchOwner !== row.id) {
          metrics.keyCollisions += 1
          metrics.ambiguousRows += 1
          metrics.skipped += 1
          continue
        }

        const existingOwner = await activeKeyOwnerId(admin, platform, key, row.id)
        if (existingOwner) {
          metrics.keyCollisions += 1
          metrics.ambiguousRows += 1
          metrics.skipped += 1
          continue
        }

        keysClaimedInBatch.set(key, row.id)
      }

      const patch = saleInstanceIdentityDbColumns(identity)

      if (!dryRun) {
        const { error: updErr } = await fromBase(admin, 'ingested_sales').update(patch).eq('id', row.id)
        if (updErr) {
          if (/duplicate key|unique constraint|23505/i.test(updErr.message)) {
            metrics.keyCollisions += 1
            metrics.ambiguousRows += 1
            metrics.skipped += 1
            continue
          }
          throw new Error(updErr.message)
        }

        await recordIngestedSaleSourceUrl(admin, {
          ingestedSaleId: row.id,
          sourcePlatform: platform,
          sourceUrl: row.source_url,
          sourceListingId: identity.source_listing_id,
          payloadHash: identity.source_payload_hash,
        })
      }

      metrics.rowsBackfilled += 1
      metrics.aliasesRecorded += 1
    }

    resumeAfterId = metrics.lastProcessedId

    logger.info('ystm_sale_instance_identity_backfill_batch', {
      component: 'ingestion/identity/backfillYstmSaleInstanceIdentity',
      operation: logOp,
      dryRun,
      batchProcessed: chunk.length,
      ...metrics,
    })

    if (chunk.length < batchSize) break
  }

  logger.info('ystm_sale_instance_identity_backfill_complete', {
    component: 'ingestion/identity/backfillYstmSaleInstanceIdentity',
    operation: logOp,
    ...metrics,
  })

  return metrics
}
