import {
  fetchEsnetCoverageBootstrapState,
  setEsnetCoverageBootstrapEnabled,
} from '@/lib/ingestion/estatesalesnet/coverageBootstrapEstatesalesNet'
import type {
  CoverageBootstrapDisabledReason,
  CoverageBootstrapExitEvaluation,
} from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import { COVERAGE_BOOTSTRAP_MIN_ENABLED_HOURS } from '@/lib/ingestion/ystmCoverage/coverageBudgetProfiles'
import { partitionCrawlableCityConfigsByPlatform } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type EsnetCoverageBootstrapExitSnapshot = {
  crawlableConfigCount: number
  fetchFailureRate24h: number | null
  enabledAt: string | null
  nowMs?: number
}

const ESNET_BOOTSTRAP_MIN_CRAWLABLE_CONFIGS = 5

export function evaluateEsnetCoverageBootstrapExitCriteria(
  snapshot: EsnetCoverageBootstrapExitSnapshot
): CoverageBootstrapExitEvaluation {
  const nowMs = snapshot.nowMs ?? Date.now()
  const reasons: string[] = []

  if (snapshot.crawlableConfigCount < ESNET_BOOTSTRAP_MIN_CRAWLABLE_CONFIGS) {
    reasons.push(
      `crawlableConfigCount ${snapshot.crawlableConfigCount} < ${ESNET_BOOTSTRAP_MIN_CRAWLABLE_CONFIGS}`
    )
  }
  if (snapshot.fetchFailureRate24h != null && snapshot.fetchFailureRate24h > 2) {
    reasons.push(`fetchFailureRate24h ${snapshot.fetchFailureRate24h}% > 2%`)
  }

  const enabledAtMs = snapshot.enabledAt ? Date.parse(snapshot.enabledAt) : Number.NaN
  if (!Number.isFinite(enabledAtMs)) {
    reasons.push('bootstrap enabledAt missing')
  } else {
    const enabledHours = (nowMs - enabledAtMs) / (60 * 60 * 1000)
    if (enabledHours < COVERAGE_BOOTSTRAP_MIN_ENABLED_HOURS) {
      reasons.push(
        `bootstrap enabled ${enabledHours.toFixed(1)}h < ${COVERAGE_BOOTSTRAP_MIN_ENABLED_HOURS}h minimum`
      )
    }
  }

  return { met: reasons.length === 0, reasons }
}

export async function maybeAutoDisableEsnetCoverageBootstrap(
  admin: ReturnType<typeof getAdminDb>,
  snapshot: EsnetCoverageBootstrapExitSnapshot
): Promise<{ disabled: boolean; reasons: string[] }> {
  const state = await fetchEsnetCoverageBootstrapState(admin)
  if (!state.enabled) {
    return { disabled: false, reasons: [] }
  }

  const evaluation = evaluateEsnetCoverageBootstrapExitCriteria({
    ...snapshot,
    enabledAt: state.enabledAt,
    nowMs: snapshot.nowMs ?? Date.now(),
  })

  if (!evaluation.met) {
    return { disabled: false, reasons: evaluation.reasons }
  }

  await setEsnetCoverageBootstrapEnabled(admin, {
    enabled: false,
    reason: 'exit_criteria' satisfies CoverageBootstrapDisabledReason,
    at: new Date(snapshot.nowMs ?? Date.now()),
  })

  return { disabled: true, reasons: evaluation.reasons }
}

/** Count enabled crawlable `estatesales_net` configs for bootstrap exit evaluation. */
export async function countEsnetCrawlableIngestionConfigs(
  admin: ReturnType<typeof getAdminDb>
): Promise<number> {
  const { data, error } = await fromBase(admin, 'ingestion_city_configs')
    .select('source_platform, source_pages, source_crawl_excluded_at')
    .eq('enabled', true)
    .eq('source_platform', 'estatesales_net')

  if (error || !data) return 0

  const partition = partitionCrawlableCityConfigsByPlatform(
    data as Array<{
      city: string
      state: string
      source_platform: string
      source_pages: unknown
      source_crawl_excluded_at?: string | null
    }>,
    'estatesales_net'
  )
  return partition.configsCrawlable
}
