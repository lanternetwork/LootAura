import type { SeoEnablementMetricGateFields } from '@/lib/seo/evaluateSeoEnablementGate'
import type { SeoEnablementSnapshotRow } from '@/lib/seo/snapshots/types'

/**
 * Minimal metric gate inputs from a persisted enablement snapshot row.
 */
export function buildMetricGateFieldsFromEnablementSnapshot(
  snapshot: SeoEnablementSnapshotRow
): SeoEnablementMetricGateFields {
  return {
    coveragePct: snapshot.coverage_pct,
    effectiveMissingValid: snapshot.effective_missing_valid,
    duplicateCanonicalClusters: snapshot.duplicate_canonical_clusters,
    publishedActiveInventory: snapshot.published_active_inventory,
  }
}
