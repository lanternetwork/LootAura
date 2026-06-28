import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { fetchYstmRelistDetailRefreshCandidates } from '@/lib/ingestion/ystmCoverage/loadYstmCoverageObservationsForRelist'
import {
  classifyFetchErrorForCoverage,
  classifyYstmDetailAsValidActive,
  type YstmCoverageInvalidReason,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type YstmRelistDetailRefreshTelemetry = {
  candidatesClaimed: number
  detailRefreshesAttempted: number
  relistedSuccessfully: number
  relistedStillExpired: number
  relistDetailFetchFailed: number
}

export const YSTM_RELIST_DETAIL_REFRESH_MAX_PER_RUN = 25

function emptyTelemetry(
  partial: Partial<YstmRelistDetailRefreshTelemetry> = {}
): YstmRelistDetailRefreshTelemetry {
  return {
    candidatesClaimed: 0,
    detailRefreshesAttempted: 0,
    relistedSuccessfully: 0,
    relistedStillExpired: 0,
    relistDetailFetchFailed: 0,
    ...partial,
  }
}

export async function applyYstmRelistDetailRefreshResult(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  patch: {
    ystmValidActive: boolean
    ystmInvalidReason: YstmCoverageInvalidReason | null
    detailCheckedAt: string
  }
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await fromBase(admin, 'ystm_coverage_observations')
    .update({
      ystm_valid_active: patch.ystmValidActive,
      ystm_invalid_reason: patch.ystmInvalidReason,
      last_detail_checked_at: patch.detailCheckedAt,
      needs_detail_refresh: false,
      updated_at: now,
      discovery_priority: patch.ystmValidActive ? 'warm' : 'cold',
    })
    .eq('canonical_url', canonicalUrl)
  if (error) {
    throw new Error(error.message)
  }
}

export async function runYstmRelistDetailRefresh(
  admin: ReturnType<typeof getAdminDb>,
  options?: {
    maxPerRun?: number
    startedMs?: number
    maxRuntimeMs?: number
  }
): Promise<YstmRelistDetailRefreshTelemetry> {
  const logContext = { component: 'ingestion/ystmCoverage/runYstmRelistDetailRefresh' }
  const maxPerRun = options?.maxPerRun ?? YSTM_RELIST_DETAIL_REFRESH_MAX_PER_RUN
  const startedMs = options?.startedMs ?? Date.now()
  const maxRuntimeMs = options?.maxRuntimeMs ?? 120_000

  const candidates = await fetchYstmRelistDetailRefreshCandidates(admin, maxPerRun)
  const telemetry = emptyTelemetry({ candidatesClaimed: candidates.length })

  for (const candidate of candidates) {
    if (telemetry.detailRefreshesAttempted >= maxPerRun) break
    if (Date.now() - startedMs >= maxRuntimeMs) break

    telemetry.detailRefreshesAttempted += 1
    const detailCheckedAt = new Date().toISOString()
    const city = candidate.city?.trim() ?? ''
    const state = candidate.state?.trim() ?? ''

    try {
      const html = await fetchSafeExternalPageHtml(candidate.canonicalUrl, {
        city,
        state,
        pageIndex: 0,
        adapter: 'ystm_relist_detail_refresh',
      })
      const parsed = parseYstmDetailPageFromHtml({
        html,
        sourceUrl: candidate.canonicalUrl,
        configCity: city,
        configState: state,
      })
      const validity = classifyYstmDetailAsValidActive({ parsed, html })

      await applyYstmRelistDetailRefreshResult(admin, candidate.canonicalUrl, {
        ystmValidActive: validity.valid,
        ystmInvalidReason: validity.valid ? null : validity.reason,
        detailCheckedAt,
      })

      if (validity.valid) {
        telemetry.relistedSuccessfully += 1
      } else {
        telemetry.relistedStillExpired += 1
      }
    } catch (err) {
      telemetry.relistDetailFetchFailed += 1
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('YSTM relist detail refresh failed', {
        ...logContext,
        canonicalUrl: candidate.canonicalUrl,
        message: msg,
      })
      await applyYstmRelistDetailRefreshResult(admin, candidate.canonicalUrl, {
        ystmValidActive: false,
        ystmInvalidReason: classifyFetchErrorForCoverage(msg),
        detailCheckedAt,
      })
    }
  }

  return telemetry
}
