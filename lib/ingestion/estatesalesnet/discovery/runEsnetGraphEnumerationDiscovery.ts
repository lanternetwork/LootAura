import {
  EXTERNAL_FETCH_REASON,
  fetchSafeExternalPageHtml,
  hashHostForLog,
  type ExternalFetchLogContext,
} from '@/lib/ingestion/adapters/externalPageSafeFetch'
import type { DiscoveryCronBudgets } from '@/lib/ingestion/discovery/discoveryCronConfig'
import type {
  DiscoveredCityPageCandidate,
  SourceDiscoveryFetchHtml,
  ValidatedDiscoveryCandidate,
} from '@/lib/ingestion/discovery/sourceDiscovery'
import { promoteSourceDiscoveryResults } from '@/lib/ingestion/discovery/promoteSourceDiscoveryResults'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'
import { extractEsnetCityPageCandidatesFromStateIndexHtml } from '@/lib/ingestion/estatesalesnet/discovery/extractEsnetCityPageCandidates'
import { getEsnetStateIndexEntries } from '@/lib/ingestion/estatesalesnet/discovery/esnetStateIndexCatalog'
import { validateDiscoveredEsnetCityPage } from '@/lib/ingestion/estatesalesnet/discovery/validateDiscoveredEsnetCityPage'
import { isEstatesalesNetSourceUrl } from '@/lib/ingestion/estatesalesnet/esnetHosts'
import {
  listPendingSourcePageCandidates,
  updateSourcePageCandidateValidation,
  upsertDiscoveredSourcePageCandidates,
  type YstmSourcePageCandidateRow,
} from '@/lib/ingestion/discovery/ystmSourcePageCandidatesStore'
import {
  mapDiscoveryValidationToCandidateStatus,
  mapFetchErrorToCandidateStatus,
} from '@/lib/ingestion/discovery/ystmSourcePageCandidateStatus'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

const GRAPH_ENUM_ADAPTER = 'esnet_graph_enumeration'

function buildFetchContext(index: number, stateCode: string, city: string): ExternalFetchLogContext {
  return {
    component: 'ingestion/estatesalesnet/discovery/runEsnetGraphEnumerationDiscovery',
    operation: 'fetch_page',
    adapter: GRAPH_ENUM_ADAPTER,
    city,
    state: stateCode,
    pageIndex: index,
    hostHash: hashHostForLog('www.estatesales.net'),
    reason: EXTERNAL_FETCH_REASON.OK,
  }
}

export type EsnetGraphEnumerationTelemetry = {
  statesScanned: number
  candidatePagesDiscovered: number
  candidateRegistryUpserts: number
  candidatePagesValid: number
  candidatePagesInvalid: number
  validationsAttempted: number
  fetchFailures: number
  configsPromoted: number
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

function rowToDiscovered(row: YstmSourcePageCandidateRow): DiscoveredCityPageCandidate {
  const meta = row.metadata ?? {}
  return {
    city: typeof meta.city === 'string' ? meta.city : row.city_slug ?? row.state,
    state: row.state,
    statePathSegment: row.state,
    canonicalUrl: row.canonical_url,
    sharedHubPage: meta.sharedHubPage === true,
    cityPathSegment: row.city_slug ?? 'metro',
  }
}

export async function runEsnetGraphEnumerationDiscovery(
  admin: ReturnType<typeof getAdminDb>,
  args: {
    stateCodes: string[]
    budgets: DiscoveryCronBudgets
    fetchHtml?: SourceDiscoveryFetchHtml
    telemetryContext?: Record<string, unknown>
  }
): Promise<{
  ok: boolean
  promotable: ValidatedDiscoveryCandidate[]
  telemetry: EsnetGraphEnumerationTelemetry
  error?: string
}> {
  const telemetry: EsnetGraphEnumerationTelemetry = {
    statesScanned: 0,
    candidatePagesDiscovered: 0,
    candidateRegistryUpserts: 0,
    candidatePagesValid: 0,
    candidatePagesInvalid: 0,
    validationsAttempted: 0,
    fetchFailures: 0,
    configsPromoted: 0,
  }

  const fetchHtml = args.fetchHtml ?? fetchSafeExternalPageHtml
  const globalSeen = new Set<string>()
  const discovered: DiscoveredCityPageCandidate[] = []

  const stateEntries = getEsnetStateIndexEntries(args.stateCodes).slice(0, args.budgets.maxStatesPerRun)

  if (args.stateCodes.length > 0 && stateEntries.length === 0) {
    return { ok: false, promotable: [], telemetry, error: 'no_resolved_state_index_entries' }
  }

  try {
    const indexHtmlByState = await mapPool(stateEntries, args.budgets.indexFetchConcurrency, async (entry, idx) => {
      const html = await fetchHtml(entry.indexUrl, buildFetchContext(idx, entry.stateCode, 'discovery'))
      return { entry, html }
    })

    for (const { entry, html } of indexHtmlByState) {
      telemetry.statesScanned += 1
      const batch = extractEsnetCityPageCandidatesFromStateIndexHtml(html, entry)
      const newInState: DiscoveredCityPageCandidate[] = []
      for (const candidate of batch) {
        if (globalSeen.has(candidate.canonicalUrl)) continue
        globalSeen.add(candidate.canonicalUrl)
        discovered.push(candidate)
        newInState.push(candidate)
        if (discovered.length >= args.budgets.maxDiscoveredPagesPerRun) break
      }
      if (newInState.length > 0) {
        const upserted = await upsertDiscoveredSourcePageCandidates(admin, {
          candidates: newInState,
          discoveredFromUrl: entry.indexUrl,
        })
        telemetry.candidateRegistryUpserts += upserted.insertedOrUpdated
      }
      if (discovered.length >= args.budgets.maxDiscoveredPagesPerRun) break
    }

    telemetry.candidatePagesDiscovered = discovered.length

    const validationTargets = (await listPendingSourcePageCandidates(
      admin,
      Math.max(args.budgets.maxValidationFetchesPerRun, args.budgets.maxDiscoveredPagesPerRun)
    )).filter((row) => isEstatesalesNetSourceUrl(row.canonical_url))

    const validated: ValidatedDiscoveryCandidate[] = []
    const maxValidations = args.budgets.maxValidationFetchesPerRun
    const toValidate = validationTargets.slice(0, maxValidations)

    await mapPool(toValidate, args.budgets.validationFetchConcurrency, async (row, idx) => {
      telemetry.validationsAttempted += 1
      const discoveredRow = rowToDiscovered(row)
      try {
        const html = await fetchHtml(
          row.canonical_url,
          buildFetchContext(idx, discoveredRow.state, discoveredRow.city)
        )
        const validation = validateDiscoveredEsnetCityPage({
          html,
          pageUrl: row.canonical_url,
          city: discoveredRow.city,
          state: discoveredRow.state,
        })
        const mapped = mapDiscoveryValidationToCandidateStatus(validation)
        await updateSourcePageCandidateValidation(admin, row.canonical_url, {
          validationStatus: mapped.status,
          validationFailureReason: mapped.failureReason,
        })
        if (validation.ok) {
          telemetry.candidatePagesValid += 1
          validated.push({ ...discoveredRow, validation })
        } else {
          telemetry.candidatePagesInvalid += 1
        }
      } catch (e) {
        telemetry.fetchFailures += 1
        const message = e instanceof Error ? e.message : String(e)
        const mapped = mapFetchErrorToCandidateStatus(message)
        await updateSourcePageCandidateValidation(admin, row.canonical_url, {
          validationStatus: mapped.status,
          validationFailureReason: mapped.failureReason,
        })
        telemetry.candidatePagesInvalid += 1
      }
    })

    const promotion = await promoteSourceDiscoveryResults(admin, {
      dryRun: false,
      candidates: validated,
      sourcePlatform: ESNET_SOURCE_PLATFORM,
      telemetryContext: args.telemetryContext,
    })
    if (promotion.ok) {
      telemetry.configsPromoted += promotion.telemetry.configsPromoted
    }

    return { ok: true, promotable: validated, telemetry }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logger.warn('esnet graph enumeration failed', {
      component: 'ingestion/estatesalesnet/discovery/runEsnetGraphEnumerationDiscovery',
      operation: 'graph_enumeration',
      message,
      ...args.telemetryContext,
    })
    return { ok: false, promotable: [], telemetry, error: message }
  }
}
