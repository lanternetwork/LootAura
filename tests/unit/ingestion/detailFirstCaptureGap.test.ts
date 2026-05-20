import { describe, expect, it } from 'vitest'
import { buildDetailFirstCaptureMetrics } from '@/lib/ingestion/acquisition/detailFirstCaptureGap'

describe('buildDetailFirstCaptureMetrics', () => {
  it('computes parser vs visible capture gap', () => {
    const metrics = buildDetailFirstCaptureMetrics({
      crawlerDiscovered: 52000,
      duplicateSkipped: 51000,
      freshInserted: 63,
      detailFirstAttempted: 800,
      detailFirstReady: 720,
      detailFirstPublished: 700,
    })
    expect(metrics.parserSuccessRate).toBeCloseTo(0.9, 2)
    expect(metrics.visibleCaptureRate).toBeCloseTo(0.0012, 4)
    expect(metrics.parserToVisibleGapRate).not.toBeNull()
    expect(metrics.parserSloMetVisibleCaptureLow).toBe(true)
  })

  it('returns null rates when denominators are zero', () => {
    const metrics = buildDetailFirstCaptureMetrics({
      crawlerDiscovered: 0,
      duplicateSkipped: 0,
      freshInserted: 0,
      detailFirstAttempted: 0,
      detailFirstReady: 0,
      detailFirstPublished: 0,
    })
    expect(metrics.parserSuccessRate).toBeNull()
    expect(metrics.visibleCaptureRate).toBeNull()
    expect(metrics.parserSloMetVisibleCaptureLow).toBe(false)
  })
})
