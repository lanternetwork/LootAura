import { describe, expect, it } from 'vitest'
import {
  extractSanitizedStackTop,
  formatAdminIngestionJobError,
} from '@/lib/admin/ingestion/formatAdminIngestionJobError'

describe('formatAdminIngestionJobError', () => {
  it('sanitizes message and stack top', () => {
    const err = new Error('insert failed https://example.com/sale')
    err.stack = 'Error: insert failed\n    at run (https://example.com/path:1:1)'
    const formatted = formatAdminIngestionJobError(err)
    expect(formatted.error).toBe('insert failed [redacted-url]')
    expect(formatted.stack_top).toContain('[redacted-url]')
  })

  it('wraps non-Error throws', () => {
    expect(formatAdminIngestionJobError('plain failure').error).toBe('plain failure')
    expect(formatAdminIngestionJobError('plain failure').stack_top).toBeNull()
  })
})

describe('extractSanitizedStackTop', () => {
  it('returns null when stack is absent', () => {
    const err = new Error('no stack')
    err.stack = undefined
    expect(extractSanitizedStackTop(err)).toBeNull()
  })
})
