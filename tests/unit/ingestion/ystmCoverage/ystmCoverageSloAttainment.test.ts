import { describe, expect, it } from 'vitest'
import {
  computeCoverageSloAttainment,
  countConsecutiveDaysAtCoverageTarget,
  groupLastAuditPerUtcDay,
  YSTM_COVERAGE_SLO_STEADY_STATE_DAYS,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageSloAttainment'
import { YSTM_COVERAGE_SLO_MIN_VALID_URLS } from '@/lib/ingestion/ystmCoverage/ystmCoverageOperationalHealth'

describe('ystmCoverageSloAttainment', () => {
  it('uses last audit per UTC day when multiple runs share a day', () => {
    const byDay = groupLastAuditPerUtcDay([
      {
        completedAt: '2026-05-20T06:00:00.000Z',
        coveragePct: 70,
        validActiveYstmUrls: 100,
      },
      {
        completedAt: '2026-05-20T18:00:00.000Z',
        coveragePct: 92,
        validActiveYstmUrls: 100,
      },
    ])
    expect(byDay.size).toBe(1)
    expect(byDay.get('2026-05-20')?.coveragePct).toBe(92)
  })

  it('counts consecutive days at target from most recent backward', () => {
    const byDay = groupLastAuditPerUtcDay([
      { completedAt: '2026-05-18T06:00:00.000Z', coveragePct: 88, validActiveYstmUrls: 100 },
      { completedAt: '2026-05-19T06:00:00.000Z', coveragePct: 91, validActiveYstmUrls: 100 },
      { completedAt: '2026-05-20T06:00:00.000Z', coveragePct: 93, validActiveYstmUrls: 100 },
    ])
    expect(
      countConsecutiveDaysAtCoverageTarget(byDay, 90, YSTM_COVERAGE_SLO_MIN_VALID_URLS)
    ).toBe(2)
  })

  it('marks program complete only after 14 days, footprint, and current coverage', () => {
    const trend = Array.from({ length: 14 }, (_, i) => {
      const day = 20 - i
      return {
        completedAt: `2026-05-${String(day).padStart(2, '0')}T06:00:00.000Z`,
        coveragePct: 91,
        validActiveYstmUrls: 6000,
      }
    })

    const complete = computeCoverageSloAttainment({
      trend,
      targetPct: 90,
      currentCoveragePct: 91,
      currentValidActiveUrls: 6000,
    })
    expect(complete.consecutiveDaysAtTarget).toBe(14)
    expect(complete.programComplete).toBe(true)
    expect(complete.requiredConsecutiveDays).toBe(YSTM_COVERAGE_SLO_STEADY_STATE_DAYS)
  })

  it('does not mark program complete when streak is short', () => {
    const attainment = computeCoverageSloAttainment({
      trend: [
        { completedAt: '2026-05-20T06:00:00.000Z', coveragePct: 92, validActiveYstmUrls: 6000 },
      ],
      targetPct: 90,
      currentCoveragePct: 92,
      currentValidActiveUrls: 6000,
    })
    expect(attainment.programComplete).toBe(false)
    expect(attainment.consecutiveDaysAtTarget).toBe(1)
  })

  it('does not mark program complete when footprint is below program minimum', () => {
    const trend = Array.from({ length: 14 }, (_, i) => ({
      completedAt: `2026-05-${String(20 - i).padStart(2, '0')}T06:00:00.000Z`,
      coveragePct: 92,
      validActiveYstmUrls: 100,
    }))
    const attainment = computeCoverageSloAttainment({
      trend,
      targetPct: 90,
      currentCoveragePct: 92,
      currentValidActiveUrls: 100,
    })
    expect(attainment.consecutiveDaysAtTarget).toBe(14)
    expect(attainment.footprintMeetsProgramMinimum).toBe(false)
    expect(attainment.programComplete).toBe(false)
  })
})
