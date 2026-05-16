import { describe, expect, it } from 'vitest'
import { resolveTimezoneForIngestionState } from '@/lib/ingestion/discovery/stateTimezoneMap'

describe('resolveTimezoneForIngestionState', () => {
  it('resolves IL and IN timezones', () => {
    expect(resolveTimezoneForIngestionState('IL')).toBe('America/Chicago')
    expect(resolveTimezoneForIngestionState('IN')).toBe('America/Indiana/Indianapolis')
  })

  it('returns null for unknown state', () => {
    expect(resolveTimezoneForIngestionState('ZZ')).toBeNull()
  })
})
