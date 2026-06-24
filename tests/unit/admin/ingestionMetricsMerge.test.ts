import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { IngestionMetricsDiagnosticsResponse } from '@/lib/admin/ingestionMetricsTypes'
import { mergeIngestionMetricsWithDiagnostics } from '@/lib/admin/ingestionMetricsMerge'
import { minimalMetrics } from './ystmStabilizationExitCriteria.test'

describe('mergeIngestionMetricsWithDiagnostics', () => {
  it('overlays diagnostics fields onto core metrics', () => {
    const core = minimalMetrics()
    const diagnostics = {
      ok: true as const,
      generatedAt: '2026-01-02T00:00:00.000Z',
      diagnosticsLoaded: true as const,
      detailFirstProof: core.detailFirstProof,
      funnel: core.funnel,
      failureBreakdown: { ...core.failureBreakdown, needs_check: 42 },
      needsCheckBreakdown: {
        total: 42,
        legacyTotalIncludingArchived: 42,
        terminalActive: 0,
        terminalArchived: 0,
        scanned: 42,
        byAddressStatus: {},
        byCoordinatePrecision: {},
        topPairs: [],
      },
      needsCheckRootCauseAnalysis: {
        total: 42,
        scanned: 42,
        byBlockerCategory: {} as never,
        byAgeBucket: {} as never,
        byPublishability: {},
        failureSignals: {},
        topPairs: [],
      },
      listFastFailureDistributionAnalysis: null,
      publishedNotVisibleDistributionAnalysis: null,
      addressEnrichmentDrainCohort: null,
      geocodeDeadLetter: {
        replayableTransientNeedsCheck: 3,
        terminalGeocodeNeedsCheck: 7,
      },
    } as IngestionMetricsDiagnosticsResponse

    const merged = mergeIngestionMetricsWithDiagnostics(core, diagnostics)
    expect(merged.failureBreakdown.needs_check).toBe(42)
    expect(merged.volume.geocode.replayableTransientNeedsCheck).toBe(3)
    expect(merged.volume.geocode.terminalGeocodeNeedsCheck).toBe(7)
    expect(merged.needsCheckBreakdown?.total).toBe(42)
  })
})

describe('IngestionDashboardClient polling', () => {
  it('does not poll full metrics every 5 seconds', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/admin/ingestion/IngestionDashboardClient.tsx'),
      'utf8'
    )
    expect(source).not.toMatch(/METRICS_POLL_MS\s*=\s*5000/)
    expect(source).toContain('INGESTION_CORE_METRICS_POLL_MS')
    expect(source).toContain('coreInFlightRef')
    expect(source).toContain('visibilityState')
    expect(source).toContain('/api/admin/ingestion/metrics/diagnostics')
  })
})
