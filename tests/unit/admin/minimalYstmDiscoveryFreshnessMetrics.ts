import type { YstmDiscoveryFreshnessMetrics } from '@/lib/ingestion/ystmCoverage/discoveryFreshness/loadYstmDiscoveryFreshnessMetrics'

export function minimalYstmDiscoveryFreshnessMetrics(
  overrides: Partial<YstmDiscoveryFreshnessMetrics> = {}
): YstmDiscoveryFreshnessMetrics {
  return {
    generatedAt: '2026-05-22T00:00:00Z',
    comparableListingCount: 0,
    measuredDiscoveryCount: 0,
    measuredPublishCount: 0,
    telemetryCompletenessPct: null,
    proxyAppearancePct: null,
    discoveryLatencyHours: { p50: null, p90: null, p95: null, sampleCount: 0 },
    publishLatencyHours: { p50: null, p90: null, p95: null, sampleCount: 0 },
    configInventoryByClass: {
      ACTIVE: 0,
      LOW_ACTIVITY: 0,
      DORMANT: 0,
      DEAD: 0,
    },
    velocityPoolCounts: { HOT: 0, WARM: 0, COLD: 0 },
    concentration: {
      configsFor50PctListings: 0,
      configsFor80PctListings: 0,
      configsFor95PctListings: 0,
      zeroYieldConfigCount: 0,
    },
    capacityPlan: [
      {
        target: '48h',
        targetHours: 48,
        activeConfigCount: 0,
        requiredChecksPerDay: 0,
        currentChecksPerDay: 320,
        requiredRunsPerDay: 0,
        gapChecksPerDay: 0,
        feasibleWithCurrentBudget: true,
      },
      {
        target: '24h',
        targetHours: 24,
        activeConfigCount: 0,
        requiredChecksPerDay: 0,
        currentChecksPerDay: 320,
        requiredRunsPerDay: 0,
        gapChecksPerDay: 0,
        feasibleWithCurrentBudget: true,
      },
      {
        target: '4h',
        targetHours: 4,
        activeConfigCount: 0,
        requiredChecksPerDay: 0,
        currentChecksPerDay: 320,
        requiredRunsPerDay: 0,
        gapChecksPerDay: 0,
        feasibleWithCurrentBudget: true,
      },
    ],
    crawlableConfigCount: 0,
    ...overrides,
  }
}
