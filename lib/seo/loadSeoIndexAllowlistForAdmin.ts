import type { NextRequest } from 'next/server'
import { GET as getYstmCoverage } from '@/app/api/admin/ingestion/ystm-coverage/route'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
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

/**
 * Loads the same SEO index allowlist snapshot as the ingestion dashboard by reusing
 * the admin metrics + coverage API handlers (single source of truth, server-side only).
 */
export async function loadSeoIndexAllowlistForAdmin(
  request: NextRequest
): Promise<SeoIndexAllowlistSnapshot> {
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

  return evaluateSeoIndexAllowlist(metrics, coverage, rolloutState)
}

/** National operational allowlist pass — mirrors SeoOperationalPanel / metro expansion wiring. */
export function resolveSeoNationalIndexingAllowed(allowlist: SeoIndexAllowlistSnapshot): boolean {
  return allowlist.indexingAllowed
}
