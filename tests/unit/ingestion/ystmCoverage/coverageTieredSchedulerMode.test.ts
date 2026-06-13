import { describe, expect, it } from 'vitest'
import { isCoverageTieredSchedulerSchemaUnavailable } from '@/lib/ingestion/ystmCoverage/coverageTieredSchedulerMode'

describe('coverageTieredSchedulerMode', () => {
  it('detects missing tiered scheduler schema', () => {
    expect(
      isCoverageTieredSchedulerSchemaUnavailable({
        code: '42703',
        message: 'column coverage_tiered_scheduler_enabled does not exist',
      })
    ).toBe(true)
    expect(
      isCoverageTieredSchedulerSchemaUnavailable({
        code: '42703',
        message: 'column long_tail_cursor does not exist',
      })
    ).toBe(true)
    expect(
      isCoverageTieredSchedulerSchemaUnavailable({
        code: '42703',
        message: 'column cursor does not exist',
      })
    ).toBe(false)
  })
})
