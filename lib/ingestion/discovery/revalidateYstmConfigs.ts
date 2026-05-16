import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import {
  EXTERNAL_FETCH_REASON,
  fetchSafeExternalPageHtml,
  hashHostForLog,
  type ExternalFetchLogContext,
} from '@/lib/ingestion/adapters/externalPageSafeFetch'
import {
  normalizeIngestionCity,
  normalizeIngestionState,
} from '@/lib/ingestion/normalizeIngestionLocation'
import {
  buildCrawlExcludedPatch,
  buildDiscoveryAttemptPatch,
  buildFailedDiscoveryPatch,
  buildFailedDiscoveryWithCountPatch,
  buildRevalidatedTimestampsPatch,
  buildValidatedSourcePagesPatch,
} from '@/lib/ingestion/discovery/discoveryConfigPatches'
import {
  isCrawlExcludedDiscoveryRow,
  PLACEHOLDER_UNRESOLVED_REASON,
  shouldExcludePlaceholderFromCrawl,
} from '@/lib/ingestion/discovery/discoveryPlaceholderPolicy'
import {
  extractCityPageCandidatesFromStateIndexHtml,
  type YstmDiscoveredCityPageCandidate,
  type YstmDiscoveryFetchHtml,
} from '@/lib/ingestion/discovery/ystmDiscovery'
import {
  isMalformedIngestionCityName,
  promoteYstmDiscoveryResults,
  type IngestionCityConfigDiscoveryRow,
} from '@/lib/ingestion/discovery/promoteYstmDiscoveryResults'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'
import {
  getVerifiedYstmStateIndexEntries,
  type YstmStateIndexEntry,
} from '@/lib/ingestion/discovery/ystmStateIndexCatalog'
import {
  isSharedMetroHubSlug,
  validateDiscoveredYstmCityPage,
  type DiscoveryValidationResult,
} from '@/lib/ingestion/discovery/ystmDiscoveryValidator'
import {
  emitDiscoveryRevalidationCompleted,
  hashDiscoveryUrl,
  type DiscoveryRevalidationTelemetry,
} from '@/lib/ingestion/discovery/ystmDiscoveryTelemetry'
import { logger } from '@/lib/log'

const EXTERNAL_PAGE_SOURCE = 'external_page_source'
const ADAPTER_ID = 'ystm_source_revalidation'
const DEFAULT_MAX_CONFIGS_PER_RUN = 100
const DEFAULT_FETCH_CONCURRENCY = 3

type AdminDb = ReturnType<typeof getAdminDb>

export type RevalidateYstmConfigsArgs = {
  states?: string[]
  dryRun?: boolean
  maxConfigsPerRun?: number
  fetchConcurrency?: number
  fetchHtml?: YstmDiscoveryFetchHtml
  telemetryContext?: Record<string, unknown>
  placeholderFailureExcludeThreshold?: number
}

export type RevalidationRecordAction =
  | 'validated'
  | 'repaired'
  | 'failed'
  | 'unchanged'
  | 'skipped'

export type RevalidationRecord = {
  city: string
  state: string
  action: RevalidationRecordAction
  reason?: string
  canonicalUrlHash?: string
  hubDrift?: boolean
}

export type RevalidateYstmConfigsResult = {
  ok: boolean
  dryRun: boolean
  records: RevalidationRecord[]
  telemetry: DiscoveryRevalidationTelemetry
  error?: string
}

function parseMax(value: number | undefined, fallback: number, cap: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), cap)
}

function buildFetchContext(
  index: number,
  stateCode: string,
  telemetryContext?: Record<string, unknown>
): ExternalFetchLogContext {
  return {
    component: 'ingestion/discovery/revalidateYstmConfigs',
    operation: 'fetch_page',
    adapter: ADAPTER_ID,
    city: 'revalidation',
    state: stateCode,
    pageIndex: index,
    hostHash: hashHostForLog('yardsaletreasuremap.com'),
    reason: EXTERNAL_FETCH_REASON.OK,
    ...telemetryContext,
  }
}

function normalizedConfigCityState(row: IngestionCityConfigDiscoveryRow): {
  city: string
  state: string
} | null {
  const city = normalizeIngestionCity(row.city)
  const state = normalizeIngestionState(row.state)
  if (!city || !state) return null
  return { city, state }
}

function isManualRow(row: IngestionCityConfigDiscoveryRow): boolean {
  return row.source_discovery_status === SOURCE_DISCOVERY_STATUS.manual
}

function primaryCanonicalUrl(row: IngestionCityConfigDiscoveryRow): string | null {
  const pages = normalizeSourcePages(row.source_pages)
  return pages[0] ?? null
}

function hasDiscoveryAttempt(row: IngestionCityConfigDiscoveryRow): boolean {
  return row.source_last_discovered_at != null && row.source_last_discovered_at !== ''
}

/** Shared hub URLs may differ from config municipality slug by design. */
export function detectHubDrift(configCity: string, canonicalUrl: string): boolean {
  let parts: string[]
  try {
    parts = new URL(canonicalUrl).pathname.split('/').filter(Boolean)
  } catch {
    return false
  }
  const citySegment = parts[2] ?? ''
  if (!citySegment || isSharedMetroHubSlug(citySegment)) return false
  const urlCity = normalizeIngestionCity(citySegment.replace(/\.html?$/i, ''))
  const cfgCity = normalizeIngestionCity(configCity)
  if (!urlCity || !cfgCity) return false
  return urlCity !== cfgCity
}

export type ValidateConfigSourcePageResult = {
  validation: DiscoveryValidationResult
  canonicalUrl: string
  hubDrift: boolean
}

/**
 * Fetch and validate a config's primary HTTPS source page.
 */
export async function validateConfigSourcePage(
  row: IngestionCityConfigDiscoveryRow,
  fetchHtml: YstmDiscoveryFetchHtml,
  fetchIndex: number,
  telemetryContext?: Record<string, unknown>
): Promise<ValidateConfigSourcePageResult | { error: string }> {
  const loc = normalizedConfigCityState(row)
  if (!loc) {
    return {
      validation: { ok: false, reason: 'invalid_city_or_state' },
      canonicalUrl: '',
      hubDrift: false,
    } satisfies ValidateConfigSourcePageResult
  }

  const canonicalUrl = primaryCanonicalUrl(row)
  if (!canonicalUrl) {
    return { validation: { ok: false, reason: 'missing_source_pages' }, canonicalUrl: '', hubDrift: false }
  }

  let html: string
  try {
    html = await fetchHtml(canonicalUrl, buildFetchContext(fetchIndex, loc.state, telemetryContext))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { error: message }
  }

  const validation = validateDiscoveredYstmCityPage({
    html,
    pageUrl: canonicalUrl,
    city: loc.city,
    state: loc.state,
  })

  return {
    validation,
    canonicalUrl,
    hubDrift: detectHubDrift(loc.city, canonicalUrl),
  }
}

function pickRediscoveryCandidate(
  row: IngestionCityConfigDiscoveryRow,
  candidates: YstmDiscoveredCityPageCandidate[]
): YstmDiscoveredCityPageCandidate | null {
  const loc = normalizedConfigCityState(row)
  if (!loc) return null

  const exact = candidates.find(
    (c) =>
      normalizeIngestionCity(c.city) === loc.city &&
      normalizeIngestionState(c.state) === loc.state
  )
  if (exact) return exact

  if (isMalformedIngestionCityName(row.city)) {
    const normalized = normalizeIngestionCity(row.city)
    if (normalized) {
      return (
        candidates.find(
          (c) => normalizeIngestionCity(c.city) === normalized && normalizeIngestionState(c.state) === loc.state
        ) ?? null
      )
    }
  }

  return null
}

async function rediscoverValidatedCandidate(
  row: IngestionCityConfigDiscoveryRow,
  indexEntry: YstmStateIndexEntry,
  indexHtml: string,
  fetchHtml: YstmDiscoveryFetchHtml,
  fetchIndex: number,
  telemetryContext?: Record<string, unknown>
): Promise<YstmDiscoveredCityPageCandidate & { validation: DiscoveryValidationResult } | null> {
  const candidates = extractCityPageCandidatesFromStateIndexHtml(indexHtml, indexEntry)
  const match = pickRediscoveryCandidate(row, candidates)
  if (!match) return null

  const loc = normalizedConfigCityState(row)
  if (!loc) return null

  let html: string
  try {
    html = await fetchHtml(match.canonicalUrl, buildFetchContext(fetchIndex, loc.state, telemetryContext))
  } catch {
    return null
  }

  const validation = validateDiscoveredYstmCityPage({
    html,
    pageUrl: match.canonicalUrl,
    city: loc.city,
    state: loc.state,
  })

  if (!validation.ok) return null
  return { ...match, validation }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = nextIndex
      nextIndex += 1
      if (i >= items.length) break
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

async function applyConfigUpdate(
  admin: AdminDb,
  rowId: string,
  patch: Record<string, unknown>,
  dryRun: boolean
): Promise<void> {
  if (dryRun) return
  const { error } = await fromBase(admin, 'ingestion_city_configs').update(patch).eq('id', rowId)
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Revalidate registry rows, rediscover on failure, repair when validated, mark failed when unresolved.
 * Never mutates manual configs (telemetry-only validation when pages exist).
 */
export async function revalidateYstmConfigs(
  admin: AdminDb,
  args: RevalidateYstmConfigsArgs = {}
): Promise<RevalidateYstmConfigsResult> {
  const dryRun = args.dryRun === true
  const maxConfigs = parseMax(args.maxConfigsPerRun, DEFAULT_MAX_CONFIGS_PER_RUN, 500)
  const concurrency = parseMax(args.fetchConcurrency, DEFAULT_FETCH_CONCURRENCY, 10)
  const fetchHtml = args.fetchHtml ?? fetchSafeExternalPageHtml
  const telemetry: DiscoveryRevalidationTelemetry = {
    configsRevalidated: 0,
    configsRepaired: 0,
    configsFailed: 0,
    configsRediscovered: 0,
    placeholdersUnresolved: 0,
    manualRowsSkipped: 0,
    validationDriftDetected: 0,
    manualTelemetryOnly: 0,
  }
  const records: RevalidationRecord[] = []
  const now = new Date().toISOString()

  const stateFilter = args.states?.map((s) => normalizeIngestionState(s)).filter(Boolean) as string[] | undefined

  let query = fromBase(admin, 'ingestion_city_configs')
    .select(
      'id, city, state, timezone, enabled, source_platform, source_pages, source_discovery_status, source_last_discovered_at, source_last_validated_at, source_last_failed_at, source_discovery_failure_reason, source_discovery_failure_count, source_crawl_excluded_at'
    )
    .eq('source_platform', EXTERNAL_PAGE_SOURCE)
    .is('source_crawl_excluded_at', null)

  if (stateFilter && stateFilter.length > 0) {
    query = query.in('state', stateFilter)
  }

  const { data: rows, error: loadError } = await query

  if (loadError) {
    return { ok: false, dryRun, records, telemetry, error: loadError.message }
  }

  const allRows = ((rows ?? []) as IngestionCityConfigDiscoveryRow[]).slice(0, maxConfigs)
  const indexEntryByState = new Map(
    getVerifiedYstmStateIndexEntries(stateFilter).map((e) => [e.stateCode, e])
  )
  const indexHtmlCache = new Map<string, string>()

  const getStateIndexHtml = async (stateCode: string): Promise<string | null> => {
    const entry = indexEntryByState.get(stateCode)
    if (!entry) return null
    if (indexHtmlCache.has(stateCode)) return indexHtmlCache.get(stateCode) ?? null
    try {
      const html = await fetchHtml(entry.indexUrl, buildFetchContext(0, stateCode, args.telemetryContext))
      indexHtmlCache.set(stateCode, html)
      return html
    } catch {
      return null
    }
  }

  await mapPool(allRows, concurrency, async (row, rowIndex) => {
    const loc = normalizedConfigCityState(row)
    if (!loc) {
      records.push({ city: row.city, state: row.state, action: 'skipped', reason: 'invalid_city_or_state' })
      return
    }

    if (isCrawlExcludedDiscoveryRow(row)) {
      records.push({ city: loc.city, state: loc.state, action: 'skipped', reason: 'crawl_excluded' })
      return
    }

    if (isManualRow(row)) {
      telemetry.manualRowsSkipped += 1
      const url = primaryCanonicalUrl(row)
      if (url) {
        const result = await validateConfigSourcePage(row, fetchHtml, rowIndex, args.telemetryContext)
        if (!('error' in result)) {
          telemetry.manualTelemetryOnly += 1
          telemetry.configsRevalidated += 1
          if (result.hubDrift) telemetry.validationDriftDetected += 1
        }
      }
      records.push({ city: loc.city, state: loc.state, action: 'skipped', reason: 'manual_protected' })
      return
    }

    const recordBase = { city: loc.city, state: loc.state }

    try {
      let canonicalUrl = primaryCanonicalUrl(row)
      let validation: DiscoveryValidationResult | null = null
      let hubDrift = false

      if (!canonicalUrl) {
        await applyConfigUpdate(admin, row.id, buildDiscoveryAttemptPatch(now), dryRun)
        const indexHtml = await getStateIndexHtml(loc.state)
        if (indexHtml) {
          const entry = indexEntryByState.get(loc.state)
          if (entry) {
            const rediscovered = await rediscoverValidatedCandidate(
              row,
              entry,
              indexHtml,
              fetchHtml,
              rowIndex,
              args.telemetryContext
            )
            if (rediscovered) {
              telemetry.configsRediscovered += 1
              if (!dryRun) {
                const promotion = await promoteYstmDiscoveryResults(admin, {
                  dryRun: false,
                  candidates: [rediscovered],
                  telemetryContext: args.telemetryContext,
                })
                if (promotion.ok && promotion.telemetry.configsPromoted + promotion.telemetry.configsRepaired > 0) {
                  telemetry.configsRepaired += 1
                  records.push({
                    ...recordBase,
                    action: 'repaired',
                    reason: 'rediscovery_populated',
                    canonicalUrlHash: hashDiscoveryUrl(rediscovered.canonicalUrl),
                    hubDrift: rediscovered.sharedHubPage,
                  })
                  return
                }
              } else {
                telemetry.configsRepaired += 1
                records.push({
                  ...recordBase,
                  action: 'repaired',
                  reason: 'rediscovery_populated_dry_run',
                  canonicalUrlHash: hashDiscoveryUrl(rediscovered.canonicalUrl),
                })
                return
              }
            }
          }
        }

        const nextFailureCount = (row.source_discovery_failure_count ?? 0) + 1
        const excludeThreshold = args.placeholderFailureExcludeThreshold ?? 1
        const failurePatch = buildFailedDiscoveryWithCountPatch(
          now,
          PLACEHOLDER_UNRESOLVED_REASON,
          nextFailureCount
        )
        const crawlExcludePatch = shouldExcludePlaceholderFromCrawl(
          PLACEHOLDER_UNRESOLVED_REASON,
          nextFailureCount,
          excludeThreshold
        )
          ? buildCrawlExcludedPatch(now, nextFailureCount)
          : {}
        await applyConfigUpdate(
          admin,
          row.id,
          { ...failurePatch, ...buildDiscoveryAttemptPatch(now), ...crawlExcludePatch },
          dryRun
        )
        telemetry.placeholdersUnresolved += 1
        telemetry.configsFailed += 1
        records.push({ ...recordBase, action: 'failed', reason: PLACEHOLDER_UNRESOLVED_REASON })
        return
      }

      const validated = await validateConfigSourcePage(row, fetchHtml, rowIndex, args.telemetryContext)
      if ('error' in validated) {
        await applyConfigUpdate(
          admin,
          row.id,
          { ...buildFailedDiscoveryPatch(now, 'fetch_failed'), ...buildDiscoveryAttemptPatch(now) },
          dryRun
        )
        telemetry.configsFailed += 1
        records.push({ ...recordBase, action: 'failed', reason: 'fetch_failed' })
        return
      }

      validation = validated.validation
      canonicalUrl = validated.canonicalUrl
      hubDrift = validated.hubDrift

      if (hubDrift) telemetry.validationDriftDetected += 1

      if (validation.ok) {
        const needsCityNormalize = isMalformedIngestionCityName(row.city) && row.city !== loc.city
        const currentCanonical = primaryCanonicalUrl(row)
        const urlChanged = currentCanonical !== canonicalUrl

        if (needsCityNormalize || urlChanged) {
          const patch: Record<string, unknown> = {
            ...buildValidatedSourcePagesPatch(now, canonicalUrl),
            timezone: row.timezone,
          }
          if (needsCityNormalize) patch.city = loc.city
          await applyConfigUpdate(admin, row.id, patch, dryRun)
          telemetry.configsRepaired += 1
          records.push({
            ...recordBase,
            action: 'repaired',
            canonicalUrlHash: hashDiscoveryUrl(canonicalUrl),
            hubDrift,
          })
          return
        }

        await applyConfigUpdate(admin, row.id, buildRevalidatedTimestampsPatch(now), dryRun)
        telemetry.configsRevalidated += 1
        records.push({
          ...recordBase,
          action: 'validated',
          canonicalUrlHash: hashDiscoveryUrl(canonicalUrl),
          hubDrift,
        })
        return
      }

      await applyConfigUpdate(admin, row.id, buildDiscoveryAttemptPatch(now), dryRun)

      const indexHtml = await getStateIndexHtml(loc.state)
      const entry = indexEntryByState.get(loc.state)
      if (indexHtml && entry) {
        const rediscovered = await rediscoverValidatedCandidate(
          row,
          entry,
          indexHtml,
          fetchHtml,
          rowIndex,
          args.telemetryContext
        )
        if (rediscovered) {
          telemetry.configsRediscovered += 1
          const promotion = await promoteYstmDiscoveryResults(admin, {
            dryRun,
            candidates: [rediscovered],
            telemetryContext: args.telemetryContext,
          })
          if (promotion.ok && (promotion.telemetry.configsPromoted > 0 || promotion.telemetry.configsRepaired > 0)) {
            telemetry.configsRepaired += 1
            records.push({
              ...recordBase,
              action: 'repaired',
              reason: 'rediscovery_replaced_stale',
              canonicalUrlHash: hashDiscoveryUrl(rediscovered.canonicalUrl),
              hubDrift: rediscovered.sharedHubPage,
            })
            return
          }
        }
      }

      const failReason = validation.ok === false ? validation.reason : 'validation_failed'
      await applyConfigUpdate(
        admin,
        row.id,
        { ...buildFailedDiscoveryPatch(now, failReason), ...buildDiscoveryAttemptPatch(now) },
        dryRun
      )
      telemetry.configsFailed += 1
      records.push({
        ...recordBase,
        action: 'failed',
        reason: failReason,
        canonicalUrlHash: hashDiscoveryUrl(canonicalUrl),
        hubDrift,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logger.warn('ystm config revalidation row failed', {
        component: 'ingestion/discovery/revalidateYstmConfigs',
        operation: 'revalidate_row',
        city: loc.city,
        state: loc.state,
        message,
        ...args.telemetryContext,
      })
      records.push({ ...recordBase, action: 'skipped', reason: 'revalidation_error' })
    }
  })

  emitDiscoveryRevalidationCompleted(telemetry, { dryRun, ...args.telemetryContext })

  return { ok: true, dryRun, records, telemetry }
}

/** Whether a row is an empty placeholder eligible for remediation after discovery was attempted. */
export function isPlaceholderAwaitingRemediation(row: IngestionCityConfigDiscoveryRow): boolean {
  if (isManualRow(row)) return false
  if (row.source_discovery_status === SOURCE_DISCOVERY_STATUS.manual) return false
  if (isCrawlExcludedDiscoveryRow(row)) return false
  if (normalizeSourcePages(row.source_pages).length > 0) return false
  return hasDiscoveryAttempt(row)
}
