import { describe, expect, it } from 'vitest'
import { cohortQueryIsoCutoff, funnelIsoCutoff } from '@/lib/admin/ingestionMetricsBaseline'

const NOW = Date.parse('2026-05-18T12:00:00.000Z')

describe('ingestionMetricsBaseline', () => {
  it('uses window cutoff when baseline is unset', () => {
    expect(funnelIsoCutoff({ windowHours: 24, nowMs: NOW, metricsBaselineAt: null })).toBe(
      '2026-05-17T12:00:00.000Z'
    )
  })

  it('uses baseline when it is newer than the window cutoff', () => {
    expect(
      funnelIsoCutoff({
        windowHours: 24,
        nowMs: NOW,
        metricsBaselineAt: '2026-05-18T10:00:00.000Z',
      })
    ).toBe('2026-05-18T10:00:00.000Z')
  })

  it('keeps window cutoff when baseline is older than the window', () => {
    expect(
      funnelIsoCutoff({
        windowHours: 24,
        nowMs: NOW,
        metricsBaselineAt: '2026-05-10T00:00:00.000Z',
      })
    ).toBe('2026-05-17T12:00:00.000Z')
  })

  it('cohortQueryIsoCutoff matches funnelIsoCutoff for max lookback hours', () => {
    expect(
      cohortQueryIsoCutoff({
        maxLookbackHours: 24 * 7,
        nowMs: NOW,
        metricsBaselineAt: '2026-05-18T06:00:00.000Z',
      })
    ).toBe(
      funnelIsoCutoff({
        windowHours: 24 * 7,
        nowMs: NOW,
        metricsBaselineAt: '2026-05-18T06:00:00.000Z',
      })
    )
  })
})
