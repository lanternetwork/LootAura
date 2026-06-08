import { describe, it, expect } from 'vitest'
import {
  formatSocialReportTimestamp,
  formatWeekendHeroDateRange,
} from '@/lib/admin/social/formatSocialReportDisplay'

describe('formatSocialReportDisplay', () => {
  it('formats same-month weekend hero range', () => {
    const label = formatWeekendHeroDateRange(
      {
        start: '2026-06-13',
        end: '2026-06-14',
        label: 'This Weekend (Jun 13 – Jun 14, 2026)',
        monthYearLabel: 'June 2026',
      },
      'America/Chicago'
    )
    expect(label).toBe('June 13–14, 2026')
  })

  it('formats timestamp in metro timezone', () => {
    const instant = new Date('2026-06-07T13:15:00.000Z')
    const label = formatSocialReportTimestamp(instant, 'America/Chicago')
    expect(label).toContain('June 7, 2026')
    expect(label).toMatch(/CDT|CST/)
  })
})
