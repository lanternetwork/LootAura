import type {
  IngestionMetricsDiagnosticsResponse,
  IngestionMetricsResponse,
} from '@/lib/admin/ingestionMetricsTypes'

/** Merge core metrics with an expensive diagnostics patch (dashboard / copy export). */
export function mergeIngestionMetricsWithDiagnostics(
  core: IngestionMetricsResponse,
  diagnostics: IngestionMetricsDiagnosticsResponse
): IngestionMetricsResponse {
  return {
    ...core,
    generatedAt: diagnostics.generatedAt,
    detailFirstProof: diagnostics.detailFirstProof,
    failureBreakdown: diagnostics.failureBreakdown,
    needsCheckBreakdown: diagnostics.needsCheckBreakdown,
    needsCheckRootCauseAnalysis: diagnostics.needsCheckRootCauseAnalysis,
    listFastFailureDistributionAnalysis: diagnostics.listFastFailureDistributionAnalysis,
    publishedNotVisibleDistributionAnalysis: diagnostics.publishedNotVisibleDistributionAnalysis,
    addressEnrichmentDrainCohort: diagnostics.addressEnrichmentDrainCohort,
    funnel: diagnostics.funnel,
    volume: {
      ...core.volume,
      geocode: {
        ...core.volume.geocode,
        replayableTransientNeedsCheck: diagnostics.geocodeDeadLetter.replayableTransientNeedsCheck,
        terminalGeocodeNeedsCheck: diagnostics.geocodeDeadLetter.terminalGeocodeNeedsCheck,
      },
    },
  }
}
