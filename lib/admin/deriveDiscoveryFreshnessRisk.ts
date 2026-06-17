/** Matches DISCOVERY_FRESHNESS_PROGRAM_V2 publish p95 SLO in YstmDiscoveryFreshnessSection. */
export const DISCOVERY_FRESHNESS_P95_TARGET_HOURS = 4

export type DiscoveryFreshnessRisk = 'low' | 'elevated' | 'high' | 'unknown'

export function deriveDiscoveryFreshnessRisk(p95Hours: number | null): DiscoveryFreshnessRisk {
  if (p95Hours == null || !Number.isFinite(p95Hours)) return 'unknown'
  if (p95Hours <= DISCOVERY_FRESHNESS_P95_TARGET_HOURS) return 'low'
  if (p95Hours <= DISCOVERY_FRESHNESS_P95_TARGET_HOURS * 2) return 'elevated'
  return 'high'
}
