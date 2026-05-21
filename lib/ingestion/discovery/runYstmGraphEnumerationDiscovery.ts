import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import type { DiscoveryCronBudgets } from '@/lib/ingestion/discovery/discoveryCronConfig'
import {
  extractCityPageCandidatesFromStateIndexHtml,
  isEmptyStateHtmlShellIndex,
  type DiscoveredCityPageCandidate,
  type SourceDiscoveryFetchHtml,
  type ValidatedDiscoveryCandidate,
} from '@/lib/ingestion/discovery/sourceDiscovery'
import { getVerifiedStateIndexEntries } from '@/lib/ingestion/discovery/sourceStateIndexCatalog'
import { validateDiscoveredCityPage } from '@/lib/ingestion/discovery/sourceDiscoveryValidator'
import { applyYstmGraphEnumerationThrottle } from '@/lib/ingestion/discovery/ystmGraphEnumerationThrottle'
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

export type YstmGraphEnumerationTelemetry = {
  statesScanned: number
  candidatePagesDiscovered: number
  candidateRegistryUpserts: number
  candidatePagesValid: number
  candidatePagesInvalid: number
  validationsAttempted: number
  fetchFailures: number
  blockedCount: number
  throttleApplied: boolean
  throttleReasons: string[]
  backlogValidationsProcessed: number
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
    cityPathSegment: row.city_slug ? `${row.city_slug}.html` : 'city.html',
  }
}

/**
 * Nationwide graph enumeration inside the discovery cron: enumerate state indexes,
 * persist candidates, validate at scale (with throttle), promote validated pages.
 */
export async function runYstmGraphEnumerationDiscovery(
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
  telemetry: YstmGraphEnumerationTelemetry
  error?: string
}> {
  const telemetry: YstmGraphEnumerationTelemetry = {
    statesScanned: 0,
    candidatePagesDiscovered: 0,
    candidateRegistryUpserts: 0,
    candidatePagesValid: 0,
    candidatePagesInvalid: 0,
    validationsAttempted: 0,
    fetchFailures: 0,
    blockedCount: 0,
    throttleApplied: false,
    throttleReasons: [],
    backlogValidationsProcessed: 0,
  }

  const fetchHtml = args.fetchHtml ?? fetchSafeExternalPageHtml
  const concurrency = args.budgets.validationFetchConcurrency
  const globalSeen = new Set<string>()
  const discovered: DiscoveredCityPageCandidate[] = []

  const stateEntries = getVerifiedStateIndexEntries(args.stateCodes).slice(
    0,
    args.budgets.maxStatesPerRun
  )

  try {
    const indexHtmlByState = await mapPool(stateEntries, args.budgets.indexFetchConcurrency, async (entry) => {
      const html = await fetchHtml(entry.indexUrl, {
        component: 'ingestion/discovery/runYstmGraphEnumerationDiscovery',
        operation: 'fetch_state_index',
        adapter: 'ystm_graph_enumeration',
        city: 'discovery',
        state: entry.stateCode,
      })
      return { entry, html }
    })

    for (const { entry, html } of indexHtmlByState) {
      telemetry.statesScanned += 1
      if (isEmptyStateHtmlShellIndex(html)) continue
      const batch = extractCityPageCandidatesFromStateIndexHtml(html, entry)
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

    const validationTargets = await listPendingSourcePageCandidates(
      admin,
      Math.max(args.budgets.maxValidationFetchesPerRun, args.budgets.maxDiscoveredPagesPerRun)
    )

    const throttle = applyYstmGraphEnumerationThrottle({
      fetchAttempts: 0,
      fetchFailures: 0,
      blockedCount: 0,
      plannedValidations: validationTargets.length,
    })
    let maxValidations = Math.min(
      args.budgets.maxValidationFetchesPerRun,
      throttle.effectiveMaxValidations
    )
    const toValidate = validationTargets.slice(0, maxValidations)
    telemetry.backlogValidationsProcessed = toValidate.length

    const validated: ValidatedDiscoveryCandidate[] = []

    await mapPool(toValidate, concurrency, async (row) => {
      telemetry.validationsAttempted += 1
      const discoveredRow = rowToDiscovered(row)
      try {
        const html = await fetchHtml(row.canonical_url, {
          component: 'ingestion/discovery/runYstmGraphEnumerationDiscovery',
          operation: 'validate_candidate',
          adapter: 'ystm_graph_enumeration',
          city: discoveredRow.city,
          state: discoveredRow.state,
        })
        const validation = validateDiscoveredCityPage({
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
          if (mapped.status === 'blocked') telemetry.blockedCount += 1
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        telemetry.fetchFailures += 1
        const mapped = mapFetchErrorToCandidateStatus(message)
        if (mapped.status === 'blocked') telemetry.blockedCount += 1
        await updateSourcePageCandidateValidation(admin, row.canonical_url, {
          validationStatus: mapped.status,
          validationFailureReason: mapped.failureReason,
        })
        telemetry.candidatePagesInvalid += 1
      }
    })

    const postThrottle = applyYstmGraphEnumerationThrottle({
      fetchAttempts: telemetry.validationsAttempted,
      fetchFailures: telemetry.fetchFailures,
      blockedCount: telemetry.blockedCount,
      plannedValidations: args.budgets.maxValidationFetchesPerRun,
    })
    telemetry.throttleApplied = postThrottle.throttled
    telemetry.throttleReasons = postThrottle.reasons

    const promotableByUrl = new Map<string, ValidatedDiscoveryCandidate>()
    for (const c of validated) {
      promotableByUrl.set(c.canonicalUrl, c)
    }
    const promotable = [...promotableByUrl.values()]

    return { ok: true, promotable, telemetry }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error('ystm graph enumeration discovery failed', e instanceof Error ? e : new Error(message), {
      component: 'ingestion/discovery/runYstmGraphEnumerationDiscovery',
    })
    return { ok: false, promotable: [], telemetry, error: message }
  }
}
