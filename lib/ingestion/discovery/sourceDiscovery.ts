import { JSDOM } from 'jsdom'
import { deriveYardsaleTreasureMapCityPageUrl } from '@/lib/ingestion/ensureCityConfigFromListingSource'
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
import { resolveUsListStatePathSegment } from '@/lib/ingestion/adapters/usStateListPathSegment'
import {
  getVerifiedStateIndexEntries,
  EXTERNAL_SOURCE_LIST_ORIGIN,
  type SourceStateIndexEntry,
} from '@/lib/ingestion/discovery/sourceStateIndexCatalog'
import {
  isSharedMetroHubSlug,
  validateDiscoveredCityPage,
  type DiscoveryValidationResult,
} from '@/lib/ingestion/discovery/sourceDiscoveryValidator'
import {
  createDiscoveryTelemetry,
  emitDiscoveryPageValidated,
  emitDiscoveryRunCompleted,
  emitDiscoveryRunStarted,
  hashDiscoveryUrl,
  type DiscoveryTelemetrySnapshot,
} from '@/lib/ingestion/discovery/sourceDiscoveryTelemetry'

const ADAPTER_ID = 'external_source_discovery'
const DEFAULT_MAX_STATES_PER_RUN = 5
const DEFAULT_MAX_DISCOVERED_PAGES_PER_RUN = 250
const DEFAULT_MAX_VALIDATION_FETCHES_PER_RUN = 100
const DEFAULT_INDEX_FETCH_CONCURRENCY = 2
const DEFAULT_VALIDATION_FETCH_CONCURRENCY = 3

export type DiscoveredCityPageCandidate = {
  city: string
  state: string
  statePathSegment: string
  canonicalUrl: string
  sharedHubPage: boolean
  cityPathSegment: string
}

export type ValidatedDiscoveryCandidate = DiscoveredCityPageCandidate & {
  validation: DiscoveryValidationResult
}

export type SourceDiscoveryDryRunResult = {
  ok: boolean
  dryRun: true
  statesScanned: number
  candidatePagesDiscovered: number
  candidatePagesValid: number
  candidatePagesInvalid: number
  duplicatePages: number
  sharedHubPages: number
  candidates: ValidatedDiscoveryCandidate[]
  telemetry: DiscoveryTelemetrySnapshot
  error?: string
}

export type SourceDiscoveryFetchHtml = (
  pageUrl: string,
  context: ExternalFetchLogContext
) => Promise<string>

export type RunSourceDiscoveryDryRunOptions = {
  dryRun?: boolean
  states?: string[]
  maxStatesPerRun?: number
  maxDiscoveredPagesPerRun?: number
  maxValidationFetchesPerRun?: number
  indexFetchConcurrency?: number
  validationFetchConcurrency?: number
  fetchHtml?: SourceDiscoveryFetchHtml
  telemetryContext?: Record<string, unknown>
}

function parseMax(value: number | undefined, fallback: number, cap: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), cap)
}

function citySlugFromPathSegment(segment: string): string {
  return segment.replace(/\.html?$/i, '')
}

function isCityListPageHref(href: string, statePathSegment: string): boolean {
  let u: URL
  try {
    u = new URL(href, EXTERNAL_SOURCE_LIST_ORIGIN)
  } catch {
    return false
  }
  const host = u.hostname.toLowerCase()
  if (host !== 'yardsaletreasuremap.com' && host !== 'www.yardsaletreasuremap.com') {
    return false
  }
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts.length !== 3 || parts[0] !== 'US') return false
  if (parts[1]?.toLowerCase() !== statePathSegment.toLowerCase()) return false
  const citySeg = parts[2] ?? ''
  if (!/\.html?$/i.test(citySeg)) return false
  if (/(?:listing|userlisting)\.html$/i.test(citySeg)) return false
  return true
}

/**
 * Extract city list page candidates from a verified `/US/{State}/` directory index.
 */
export function extractCityPageCandidatesFromStateIndexHtml(
  html: string,
  indexEntry: SourceStateIndexEntry
): DiscoveredCityPageCandidate[] {
  const dom = new JSDOM(html, { url: indexEntry.indexUrl })
  const { document } = dom.window
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href]')
  const seen = new Set<string>()
  const out: DiscoveredCityPageCandidate[] = []

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href')?.trim()
    if (!href || !isCityListPageHref(href, indexEntry.statePathSegment)) continue

    const canonicalUrl = deriveYardsaleTreasureMapCityPageUrl(new URL(href, EXTERNAL_SOURCE_LIST_ORIGIN).href)
    if (!canonicalUrl || normalizeSourcePages([canonicalUrl]).length === 0) continue
    if (seen.has(canonicalUrl)) continue
    seen.add(canonicalUrl)

    const parts = new URL(canonicalUrl).pathname.split('/').filter(Boolean)
    const cityPathSegment = parts[2] ?? ''
    const city =
      normalizeIngestionCity(citySlugFromPathSegment(cityPathSegment)) ??
      citySlugFromPathSegment(cityPathSegment)
    const state = indexEntry.stateCode
    const sharedHubPage = isSharedMetroHubSlug(cityPathSegment)

    out.push({
      city,
      state,
      statePathSegment: indexEntry.statePathSegment,
      canonicalUrl,
      sharedHubPage,
      cityPathSegment,
    })
  }

  return out
}

/** True when a state `.html` shell page has no city links (verified on IL/AL probes). */
export function isEmptyStateHtmlShellIndex(html: string): boolean {
  const dom = new JSDOM(html)
  const anchors = dom.window.document.querySelectorAll<HTMLAnchorElement>('a[href]')
  for (const a of anchors) {
    const href = a.getAttribute('href') ?? ''
    if (/\/US\/[^/]+\/[^/]+\.html/i.test(href)) return false
  }
  return true
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

function buildFetchContext(
  index: number,
  stateCode: string,
  telemetryContext?: Record<string, unknown>
): ExternalFetchLogContext & Record<string, unknown> {
  return {
    component: 'ingestion/discovery/sourceDiscovery',
    operation: 'fetch_page',
    adapter: ADAPTER_ID,
    city: 'discovery',
    state: stateCode,
    pageIndex: index,
    hostHash: hashHostForLog('yardsaletreasuremap.com'),
    reason: EXTERNAL_FETCH_REASON.OK,
    ...telemetryContext,
  }
}

/**
 * Dry-run discovery: fetch state indexes, extract city pages, validate, emit aggregate telemetry.
 * Dry-run only: never persists candidates to the ingestion registry.
 */
export async function runSourceDiscoveryDryRun(
  options: RunSourceDiscoveryDryRunOptions = {}
): Promise<SourceDiscoveryDryRunResult> {
  const dryRun = options.dryRun !== false
  const telemetry = createDiscoveryTelemetry()
  const maxStates = parseMax(options.maxStatesPerRun, DEFAULT_MAX_STATES_PER_RUN, 50)
  const maxDiscovered = parseMax(
    options.maxDiscoveredPagesPerRun,
    DEFAULT_MAX_DISCOVERED_PAGES_PER_RUN,
    5000
  )
  const maxValidationFetches = parseMax(
    options.maxValidationFetchesPerRun,
    DEFAULT_MAX_VALIDATION_FETCHES_PER_RUN,
    500
  )
  const indexConcurrency = parseMax(options.indexFetchConcurrency, DEFAULT_INDEX_FETCH_CONCURRENCY, 5)
  const validationConcurrency = parseMax(
    options.validationFetchConcurrency,
    DEFAULT_VALIDATION_FETCH_CONCURRENCY,
    10
  )
  const fetchHtml = options.fetchHtml ?? fetchSafeExternalPageHtml

  const stateEntries = getVerifiedStateIndexEntries(options.states).slice(0, maxStates)

  emitDiscoveryRunStarted({
    dryRun,
    statesRequested: options.states?.length ?? 0,
    statesPlanned: stateEntries.length,
    ...options.telemetryContext,
  })

  if (stateEntries.length === 0) {
    emitDiscoveryRunCompleted(telemetry, { dryRun, ok: false, reason: 'no_state_entries' })
    return {
      ok: false,
      dryRun: true,
      statesScanned: 0,
      candidatePagesDiscovered: 0,
      candidatePagesValid: 0,
      candidatePagesInvalid: 0,
      duplicatePages: 0,
      sharedHubPages: 0,
      candidates: [],
      telemetry,
      error: 'no_state_entries',
    }
  }

  const globalSeen = new Set<string>()
  const discovered: DiscoveredCityPageCandidate[] = []

  try {
    const indexHtmlByState = await mapPool(stateEntries, indexConcurrency, async (entry, idx) => {
      const html = await fetchHtml(entry.indexUrl, buildFetchContext(idx, entry.stateCode, options.telemetryContext))
      telemetry.indexFetchCount += 1
      return { entry, html }
    })

    for (const { entry, html } of indexHtmlByState) {
      telemetry.statesScanned += 1
      if (isEmptyStateHtmlShellIndex(html)) {
        continue
      }
      const batch = extractCityPageCandidatesFromStateIndexHtml(html, entry)
      for (const candidate of batch) {
        if (globalSeen.has(candidate.canonicalUrl)) {
          telemetry.duplicatePages += 1
          continue
        }
        globalSeen.add(candidate.canonicalUrl)
        discovered.push(candidate)
        if (candidate.sharedHubPage) telemetry.sharedHubPages += 1
        if (discovered.length >= maxDiscovered) break
      }
      if (discovered.length >= maxDiscovered) break
    }

    telemetry.candidatePagesDiscovered = discovered.length

    const toValidate = discovered.slice(0, maxValidationFetches)
    const validated = await mapPool(toValidate, validationConcurrency, async (candidate, idx) => {
      const html = await fetchHtml(
        candidate.canonicalUrl,
        buildFetchContext(idx, candidate.state, options.telemetryContext)
      )
      telemetry.validationFetchCount += 1
      const validation = validateDiscoveredCityPage({
        html,
        pageUrl: candidate.canonicalUrl,
        city: candidate.city,
        state: candidate.state,
      })
      if (validation.ok) {
        telemetry.validPages += 1
      } else {
        telemetry.invalidPages += 1
      }
      emitDiscoveryPageValidated({
        stateCode: candidate.state,
        ok: validation.ok,
        kind: validation.ok ? validation.kind : undefined,
        reason: validation.ok ? undefined : validation.reason,
        sharedHubPage: candidate.sharedHubPage,
        pageUrlHash: hashDiscoveryUrl(candidate.canonicalUrl),
      })
      return { ...candidate, validation }
    })

    const result: SourceDiscoveryDryRunResult = {
      ok: true,
      dryRun: true,
      statesScanned: telemetry.statesScanned,
      candidatePagesDiscovered: telemetry.candidatePagesDiscovered,
      candidatePagesValid: telemetry.validPages,
      candidatePagesInvalid: telemetry.invalidPages,
      duplicatePages: telemetry.duplicatePages,
      sharedHubPages: telemetry.sharedHubPages,
      candidates: validated,
      telemetry,
    }

    emitDiscoveryRunCompleted(telemetry, { dryRun, ok: true, ...options.telemetryContext })
    return result
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    emitDiscoveryRunCompleted(telemetry, { dryRun, ok: false, reason: 'run_failed', ...options.telemetryContext })
    return {
      ok: false,
      dryRun: true,
      statesScanned: telemetry.statesScanned,
      candidatePagesDiscovered: telemetry.candidatePagesDiscovered,
      candidatePagesValid: telemetry.validPages,
      candidatePagesInvalid: telemetry.invalidPages,
      duplicatePages: telemetry.duplicatePages,
      sharedHubPages: telemetry.sharedHubPages,
      candidates: [],
      telemetry,
      error: message,
    }
  }
}

/** Normalize state path segment from index URL for tests and diagnostics. */
export function statePathSegmentFromIndexUrl(indexUrl: string): string | null {
  try {
    const parts = new URL(indexUrl).pathname.split('/').filter(Boolean)
    if (parts[0] !== 'US' || !parts[1]) return null
    return parts[1]
  } catch {
    return null
  }
}

/** Resolve USPS code from external source state path segment when known. */
export function stateCodeFromPathSegment(statePathSegment: string): string | null {
  const fromName = normalizeIngestionState(statePathSegment.replace(/-/g, ' '))
  if (fromName && fromName.length === 2) return fromName
  return normalizeIngestionState(statePathSegment)
}

export function isKnownStatePathSegment(statePathSegment: string): boolean {
  return resolveUsListStatePathSegment(statePathSegment) != null || stateCodeFromPathSegment(statePathSegment) != null
}
