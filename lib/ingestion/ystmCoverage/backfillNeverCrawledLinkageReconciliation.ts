import { passesPhase4PublicVisibility } from '@/lib/admin/classifyPublishedNotVisibleBucket'
import type { PublishedNotVisibleSaleRow } from '@/lib/admin/publishedNotVisibleDistributionTypes'
import {
  classifyFalseExclusionTrace,
  type FalseExclusionConfigSnapshot,
  type FalseExclusionObservationInput,
} from '@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace'
import {
  buildNeverCrawledLinkageReclassifyFields,
  buildNeverCrawledVisibleLinkageFields,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import {
  buildObservationFootprintInput,
  loadIngestedFootprintResolverIndex,
  resolveIngestedFootprintForObservation,
  type ResolvedIngestedFootprint,
} from '@/lib/ingestion/ystmCoverage/resolveIngestedFootprintForObservation'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const PAGE_SIZE = 500

export type NeverCrawledLinkageReconciliationBackfillResult = {
  scanned: number
  updated: number
  linkageUpdated: number
  reclassifyOnlyUpdated: number
  visibleUpdated: number
}

export type NeverCrawledLinkageObservationRow = {
  canonical_url: string
  state: string | null
  city: string | null
  config_key: string | null
  sale_instance_key: string | null
  source_listing_id: string | null
  matched_ingested_sale_id: string | null
  matched_sale_id: string | null
  missing_ingestion_outcome: string | null
  missing_ingestion_attempted_at: string | null
  missing_ingestion_failure_reason: string | null
  last_detail_checked_at: string | null
  list_metadata_snapshot: YstmListMetadataSale | null
}

const OBSERVATION_SELECT =
  'canonical_url, state, city, config_key, sale_instance_key, source_listing_id, matched_ingested_sale_id, matched_sale_id, missing_ingestion_outcome, missing_ingestion_attempted_at, missing_ingestion_failure_reason, last_detail_checked_at, list_metadata_snapshot'

async function fetchCohort(
  admin: ReturnType<typeof getAdminDb>,
  linkageOnly: boolean
): Promise<NeverCrawledLinkageObservationRow[]> {
  const rows: NeverCrawledLinkageObservationRow[] = []
  let from = 0

  for (;;) {
    let q = fromBase(admin, 'ystm_coverage_observations')
      .select(OBSERVATION_SELECT)
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('false_exclusion_primary_bucket', 'never_crawled')
      .order('canonical_url', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    q = linkageOnly
      ? q.not('matched_ingested_sale_id', 'is', null)
      : q.is('matched_ingested_sale_id', null)

    const { data, error } = await q
    if (error) throw new Error(error.message)

    const chunk = (Array.isArray(data) ? data : []) as NeverCrawledLinkageObservationRow[]
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function loadConfigsForObservations(
  admin: ReturnType<typeof getAdminDb>,
  rows: NeverCrawledLinkageObservationRow[]
): Promise<Map<string, FalseExclusionConfigSnapshot>> {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.city && row.state) {
      keys.add(`${row.state}|${row.city}`.toLowerCase())
    }
  }
  const map = new Map<string, FalseExclusionConfigSnapshot>()
  if (keys.size === 0) return map

  const { data, error } = await fromBase(admin, 'ingestion_city_configs')
    .select('city, state, enabled, source_pages, source_crawl_excluded_at, source_crawl_last_at')
    .eq('source_platform', 'external_page_source')
    .eq('enabled', true)
  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const r = row as {
      city: string
      state: string
      enabled: boolean
      source_pages: unknown
      source_crawl_excluded_at: string | null
      source_crawl_last_at: string | null
    }
    const key = `${r.state}|${r.city}`.toLowerCase()
    if (!keys.has(key)) continue
    map.set(key, {
      enabled: r.enabled,
      source_pages: r.source_pages,
      source_crawl_excluded_at: r.source_crawl_excluded_at,
      source_crawl_last_at: r.source_crawl_last_at,
    })
  }
  return map
}

async function fetchSalesByIds(
  admin: ReturnType<typeof getAdminDb>,
  saleIds: string[]
): Promise<Map<string, PublishedNotVisibleSaleRow>> {
  const map = new Map<string, PublishedNotVisibleSaleRow>()
  if (saleIds.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < saleIds.length; i += chunkSize) {
    const chunk = saleIds.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'sales')
      .select('id, status, archived_at, ends_at, moderation_status')
      .in('id', chunk)

    if (error) throw new Error(error.message)

    for (const row of (Array.isArray(data) ? data : []) as PublishedNotVisibleSaleRow[]) {
      map.set(row.id, row)
    }
  }

  return map
}

export function buildFalseExclusionObservationInput(
  row: NeverCrawledLinkageObservationRow
): FalseExclusionObservationInput {
  const configKey =
    row.config_key ?? (row.state && row.city ? `${row.state}|${row.city}` : null)
  return {
    canonicalUrl: row.canonical_url,
    state: row.state,
    city: row.city,
    configKey,
    missingIngestionOutcome: row.missing_ingestion_outcome,
    missingIngestionAttemptedAt: row.missing_ingestion_attempted_at,
    missingIngestionFailureReason: row.missing_ingestion_failure_reason,
    lastDetailCheckedAt: row.last_detail_checked_at,
  }
}

export function buildNeverCrawledLinkageReconciliationUpdate(params: {
  resolved: ResolvedIngestedFootprint
  classified: ReturnType<typeof classifyFalseExclusionTrace>
  linkedSale: PublishedNotVisibleSaleRow | null
  nowIso: string
  nowMs: number
  linkageOnly: boolean
}): Record<string, unknown> | null {
  const { resolved, classified, linkedSale, nowIso, nowMs, linkageOnly } = params

  if (
    linkedSale &&
    resolved.ingested.published_sale_id &&
    passesPhase4PublicVisibility(linkedSale, nowMs)
  ) {
    return {
      ...buildNeverCrawledVisibleLinkageFields({
        matchedIngestedSaleId: resolved.ingested.id,
        matchedSaleId: linkedSale.id,
        matchMethod: resolved.matchMethod,
      }),
      updated_at: nowIso,
    }
  }

  if (classified.primaryBucket === 'never_crawled' && linkageOnly) {
    return null
  }

  return {
    ...buildNeverCrawledLinkageReclassifyFields({
      matchedIngestedSaleId: resolved.ingested.id,
      matchMethod: resolved.matchMethod,
      primaryBucket: classified.primaryBucket,
      secondaryTags: classified.secondaryTags,
      evidence: classified.evidence,
      summary: classified.summary,
      tracedAt: nowIso,
      linkageOnly,
    }),
    updated_at: nowIso,
  }
}

async function runLinkagePass(
  admin: ReturnType<typeof getAdminDb>,
  linkageOnly: boolean,
  nowIso: string,
  nowMs: number
): Promise<{
  scanned: number
  updated: number
  linkageUpdated: number
  reclassifyOnlyUpdated: number
  visibleUpdated: number
}> {
  const cohort = await fetchCohort(admin, linkageOnly)
  const scanned = cohort.length
  if (cohort.length === 0) {
    return {
      scanned: 0,
      updated: 0,
      linkageUpdated: 0,
      reclassifyOnlyUpdated: 0,
      visibleUpdated: 0,
    }
  }

  const [index, configByKey] = await Promise.all([
    loadIngestedFootprintResolverIndex(admin, cohort),
    loadConfigsForObservations(admin, cohort),
  ])

  const saleIds = new Set<string>()
  for (const row of cohort) {
    const footprintInput = buildObservationFootprintInput(row)
    const resolved = resolveIngestedFootprintForObservation(footprintInput, index)
    const publishedSaleId = resolved?.ingested.published_sale_id?.trim()
    if (publishedSaleId) saleIds.add(publishedSaleId)
  }
  const salesById = await fetchSalesByIds(admin, [...saleIds])

  let updated = 0
  let linkageUpdated = 0
  let reclassifyOnlyUpdated = 0
  let visibleUpdated = 0

  for (const observation of cohort) {
    const footprintInput = buildObservationFootprintInput(observation)
    const resolved = resolveIngestedFootprintForObservation(footprintInput, index)
    if (!resolved) continue

    const configKey =
      observation.config_key ??
      (observation.state && observation.city ? `${observation.state}|${observation.city}` : null)
    const config =
      configKey != null ? configByKey.get(configKey.toLowerCase()) ?? null : null

    const classified = classifyFalseExclusionTrace({
      observation: buildFalseExclusionObservationInput(observation),
      ingested: resolved.ingested,
      config,
      visibleInPublishedIndex: false,
      nowIso,
    })

    const publishedSaleId = resolved.ingested.published_sale_id?.trim() || null
    const linkedSale = publishedSaleId ? salesById.get(publishedSaleId) ?? null : null

    const patch = buildNeverCrawledLinkageReconciliationUpdate({
      resolved,
      classified,
      linkedSale,
      nowIso,
      nowMs,
      linkageOnly,
    })
    if (!patch) continue

    const { error } = await fromBase(admin, 'ystm_coverage_observations')
      .update(patch)
      .eq('canonical_url', observation.canonical_url)
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('false_exclusion_primary_bucket', 'never_crawled')

    if (error) throw new Error(error.message)

    updated += 1
    if (patch.lootaura_visible === true) {
      visibleUpdated += 1
    } else if (linkageOnly) {
      reclassifyOnlyUpdated += 1
    } else {
      linkageUpdated += 1
    }
  }

  return { scanned, updated, linkageUpdated, reclassifyOnlyUpdated, visibleUpdated }
}

/**
 * Idempotent backfill: never_crawled observations with existing ingested footprint
 * (NEVER_CRAWLED_LINKAGE_REPAIR_V1).
 */
export async function backfillNeverCrawledLinkageReconciliation(
  admin: ReturnType<typeof getAdminDb>,
  nowIso: string = new Date().toISOString(),
  nowMs: number = Date.now()
): Promise<NeverCrawledLinkageReconciliationBackfillResult> {
  const linkagePass = await runLinkagePass(admin, false, nowIso, nowMs)
  const reclassifyPass = await runLinkagePass(admin, true, nowIso, nowMs)

  return {
    scanned: linkagePass.scanned + reclassifyPass.scanned,
    updated: linkagePass.updated + reclassifyPass.updated,
    linkageUpdated: linkagePass.linkageUpdated,
    reclassifyOnlyUpdated: reclassifyPass.reclassifyOnlyUpdated,
    visibleUpdated: linkagePass.visibleUpdated + reclassifyPass.visibleUpdated,
  }
}
