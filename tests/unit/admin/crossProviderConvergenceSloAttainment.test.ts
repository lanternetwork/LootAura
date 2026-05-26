import { describe, expect, it } from 'vitest'
import { computeCrossProviderConvergenceSloAttainment } from '@/lib/admin/crossProviderConvergenceSloAttainment'

describe('computeCrossProviderConvergenceSloAttainment', () => {
  it('requires 14 consecutive zero-duplicate UTC days', () => {
    const trend = Array.from({ length: 14 }, (_, i) => ({
      sloDate: `2026-05-${String(i + 1).padStart(2, '0')}`,
      duplicatePublishedCanonicalClusters: 0,
      recordedAt: `2026-05-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
    }))
    const result = computeCrossProviderConvergenceSloAttainment({
      trend,
      currentDuplicateClusters: 0,
    })
    expect(result.programComplete).toBe(true)
    expect(result.consecutiveZeroDuplicateDays).toBe(14)
  })

  it('breaks streak when a day had duplicate clusters', () => {
    const result = computeCrossProviderConvergenceSloAttainment({
      trend: [
        {
          sloDate: '2026-05-02',
          duplicatePublishedCanonicalClusters: 0,
          recordedAt: '2026-05-02T00:00:00Z',
        },
        {
          sloDate: '2026-05-01',
          duplicatePublishedCanonicalClusters: 2,
          recordedAt: '2026-05-01T00:00:00Z',
        },
      ],
      currentDuplicateClusters: 0,
    })
    expect(result.consecutiveZeroDuplicateDays).toBe(1)
    expect(result.programComplete).toBe(false)
  })
})
