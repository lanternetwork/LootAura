import { describe, expect, it } from 'vitest'
import { isPostgrestMissingModerationStatusColumn } from '@/lib/sales/isPostgrestMissingModerationStatusColumn'

describe('isPostgrestMissingModerationStatusColumn', () => {
  it('returns true for PGRST204 when message names moderation_status', () => {
    expect(
      isPostgrestMissingModerationStatusColumn({
        code: 'PGRST204',
        message: "Could not find the 'moderation_status' column of 'sales_v2' in the schema cache",
      })
    ).toBe(true)
  })

  it('returns true for 42703 when details name moderation_status', () => {
    expect(
      isPostgrestMissingModerationStatusColumn({
        code: '42703',
        message: 'column moderation_status does not exist',
      })
    ).toBe(true)
  })

  it('returns false for generic error whose message mentions moderation_status (fail closed)', () => {
    expect(
      isPostgrestMissingModerationStatusColumn({
        code: '23505',
        message: 'duplicate key violates moderation_status index constraint',
      })
    ).toBe(false)
  })

  it('returns false for PGRST204 without moderation_status in message', () => {
    expect(
      isPostgrestMissingModerationStatusColumn({
        code: 'PGRST204',
        message: "Could not find the 'some_other_column' column",
      })
    ).toBe(false)
  })

  it('returns false for PGRST301 even if message mentions moderation_status', () => {
    expect(
      isPostgrestMissingModerationStatusColumn({
        code: 'PGRST301',
        message: 'permission denied for column moderation_status',
      })
    ).toBe(false)
  })
})
