import type { NextRequest } from 'next/server'
import { GET as getYstmCoverage } from '@/app/api/admin/ingestion/ystm-coverage/route'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  evaluateSeoEnablementGate,
  type SeoEnablementGateSnapshot,
} from '@/lib/seo/evaluateSeoEnablementGate'
import { evaluateSeoIndexAllowlist, type SeoIndexAllowlistSnapshot } from '@/lib/seo/indexAllowlist'
import { buildSeoIngestionGateMetrics } from '@/lib/seo/buildSeoIngestionGateMetrics'
import { fetchSeoRolloutState } from '@/lib/seo/seoRolloutState'
import { getAdminDb } from '@/lib/supabase/clients'

export class SeoOperationalGateUnavailableError extends Error {
  constructor(message = 'Cannot determine SEO operational gate state') {
    super(message)
    this.name = 'SeoOperationalGateUnavailableError'
  }
}

export type SeoOperationalGateSnapshot = {
  allowlist: SeoIndexAllowlistSnapshot
  enablement: SeoEnablementGateSnapshot
}

/**
 * Loads SEO operational gates for admin surfaces (ingestion panel, distribution pack).
 */
export async function loadSeoIndexAllowlistForAdmin(
  request: NextRequest
): Promise<SeoOperationalGateSnapshot> {
  const [coverageRes, metrics, rolloutState] = await Promise.all([
    getYstmCoverage(request),
    buildSeoIngestionGateMetrics(),
    fetchSeoRolloutState(getAdminDb()),
  ])

  if (!coverageRes.ok) {
    throw new SeoOperationalGateUnavailableError(
      `Operational gate inputs unavailable (coverage HTTP ${coverageRes.status})`
    )
  }

  const coverage = (await coverageRes.json()) as YstmCoverageMetricsResponse

  if (!coverage.ok || !metrics.ok) {
    throw new SeoOperationalGateUnavailableError('Ingestion operational metrics reported failure')
  }

  return {
    allowlist: evaluateSeoIndexAllowlist(metrics, coverage, rolloutState),
    enablement: evaluateSeoEnablementGate(coverage, rolloutState),
  }
}

/** National SEO emission — SEO_ENABLEMENT_V2.1 metric gate + attestations. */
export function resolveSeoNationalIndexingAllowed(snapshot: SeoOperationalGateSnapshot): boolean {
  return snapshot.enablement.seoEmissionAllowed
}
