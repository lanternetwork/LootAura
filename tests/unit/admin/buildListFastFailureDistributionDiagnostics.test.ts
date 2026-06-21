import { describe, expect, it } from 'vitest'
import { buildListFastFailureDistributionDiagnostics } from '@/lib/admin/buildListFastFailureDistributionDiagnostics'
import { evaluateListFastFailureDistribution } from '@/lib/admin/evaluateListFastFailureDistribution'
import type { ListFastFailureDistributionAnalysis } from '@/lib/admin/listFastFailureDistributionTypes'

describe('buildListFastFailureDistributionDiagnostics', () => {
  it('renders section headers for a non-empty audit', () => {
    const analysis: ListFastFailureDistributionAnalysis = {
      generatedAt: '2026-06-20T12:00:00.000Z',
      cohortWindowHours: 24,
      totalFailedHot24h: 3,
      totalFailedHotWarm24h: 5,
      totalIngestedHot24h: 1,
      hotQueueDepth: 60,
      oldestFailedAgeHours: 20,
      newestFailedAgeHours: 2,
      byFailureReason: { geocode_unavailable: 2, gated_only: 1 },
      bySnapshotCompleteness: {
        complete_snapshot: 0,
        missing_snapshot: 0,
        missing_dates: 0,
        missing_title: 0,
        missing_address_and_coords: 1,
        missing_coords_only: 0,
        validity_rejected_other: 2,
      },
      byPublishSuppression: {
        existing_published_sale_linked: 0,
        sale_instance_key_collision: 0,
        archived_at_not_null: 0,
        ends_at_past: 0,
        moderation_hidden: 0,
        published_but_observation_stale: 0,
      },
      byGeocodeImpact: {
        native_coords_in_snapshot: 0,
        geocode_unavailable_failure: 2,
        validity_gated_before_geocode: 1,
        insert_failed_after_geocode: 0,
        other_failure_path: 0,
      },
      ingestedByStatus: { needs_geocode: 1 },
      ingestedNeedsGeocodeCount: 1,
      ingestedPublishFailedCount: 0,
      insertFailureDetail: {
        totalInsertFailed: 2,
        rowsWithInsertDetail: 2,
        byMessageClass: { collision_resolution_failed: 2 },
        byConstraint: { ingested_sales_active_sale_instance_key_uniq: 2 },
        sameSourceUrlMatchCount: 0,
        sameInstanceKeyMatchCount: 2,
        sameInstanceKeyDifferentUrlCount: 2,
        publishedMatchCount: 0,
        duplicateMatchCount: 0,
        expiredMatchCount: 0,
        noCollisionMatchCount: 0,
      },
    }

    const markdown = buildListFastFailureDistributionDiagnostics(
      evaluateListFastFailureDistribution(analysis)
    )

    expect(markdown).toContain('## LIST_FAST_FAILURE_DISTRIBUTION_V1')
    expect(markdown).toContain('### Section A — Cohort')
    expect(markdown).toContain('### Section G — Recommendation')
    expect(markdown).toContain('### Section H — Insert failure detail')
    expect(markdown).toContain('collision_resolution_failed')
    expect(markdown).toContain('geocode_unavailable')
  })
})
