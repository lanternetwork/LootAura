import { buildTerminalDispositionDiagnostics } from '@/lib/admin/buildTerminalDispositionDiagnostics'
import { buildAddressEnrichmentSummaryDiagnostics } from '@/lib/admin/buildAddressEnrichmentSummaryDiagnostics'
import { buildCatalogRepairSummaryDiagnostics } from '@/lib/admin/buildCatalogRepairSummaryDiagnostics'
import { buildIngestionActiveInvestigationsDiagnostics } from '@/lib/admin/buildIngestionActiveInvestigationsDiagnostics'
import { buildIngestionProjectLedgerDiagnostics } from '@/lib/admin/buildIngestionProjectLedgerDiagnostics'
import { buildIngestionSystemAssessmentDiagnostics } from '@/lib/admin/buildIngestionSystemAssessmentDiagnostics'
import { buildIngestionTopFindingsDiagnostics } from '@/lib/admin/buildIngestionTopFindingsDiagnostics'
import { buildSeoReadinessDiagnostics } from '@/lib/admin/buildSeoReadinessDiagnostics'
import { buildStrategicMetroGapDiagnostics } from '@/lib/admin/buildStrategicMetroGapDiagnostics'
import { buildYstmDiscoveryFreshnessDiagnostics } from '@/lib/admin/buildYstmDiscoveryFreshnessDiagnostics'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

/**
 * INGESTION_DIAGNOSTIC_COPY_V1 synthesized header sections (A–I).
 */
export function buildIngestionDiagnosticCopyV1Sections(
  metrics: IngestionMetricsResponse,
  coverage: YstmCoverageMetricsResponse | null
): string[] {
  const sections: string[] = [
    buildIngestionSystemAssessmentDiagnostics(metrics, coverage),
    buildIngestionTopFindingsDiagnostics(metrics, coverage),
    buildIngestionActiveInvestigationsDiagnostics(metrics, coverage),
  ]

  if (coverage?.ok && coverage.discoveryFreshness) {
    const freshness = buildYstmDiscoveryFreshnessDiagnostics(coverage)
    if (freshness) sections.push(freshness)
  }

  sections.push(
    buildAddressEnrichmentSummaryDiagnostics(metrics, coverage),
    buildTerminalDispositionDiagnostics(metrics),
    buildCatalogRepairSummaryDiagnostics(metrics, coverage)
  )

  if (coverage?.ok) {
    const metros = buildStrategicMetroGapDiagnostics(coverage)
    if (metros) sections.push(metros)

    const seo = buildSeoReadinessDiagnostics(metrics, coverage)
    if (seo) sections.push(seo)
  }

  sections.push(buildIngestionProjectLedgerDiagnostics())

  return sections
}
