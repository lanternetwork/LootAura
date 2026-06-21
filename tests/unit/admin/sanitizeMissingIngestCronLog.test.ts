import { describe, expect, it } from 'vitest'
import {
  MISSING_INGEST_CRON_LOG_MAX_CHARS,
  sanitizeMissingIngestCronLogFields,
  sanitizeMissingIngestCronLogText,
} from '@/lib/admin/sanitizeMissingIngestCronLog'

describe('sanitizeMissingIngestCronLogText', () => {
  it('redacts URLs and bearer tokens', () => {
    const raw =
      'fetch failed https://yardsaletreasuremap.com/US/FL/x/listing.html Bearer secret-token-abc'
    expect(sanitizeMissingIngestCronLogText(raw)).toBe(
      'fetch failed [redacted-url] Bearer [redacted]'
    )
  })

  it('truncates to max length', () => {
    const raw = 'x'.repeat(MISSING_INGEST_CRON_LOG_MAX_CHARS + 20)
    const sanitized = sanitizeMissingIngestCronLogText(raw)
    expect(sanitized.length).toBe(MISSING_INGEST_CRON_LOG_MAX_CHARS)
    expect(sanitized.endsWith('...')).toBe(true)
  })
})

describe('sanitizeMissingIngestCronLogFields', () => {
  it('sanitizes message and stack from Error', () => {
    const err = new Error('insert failed for https://example.com/sale')
    err.stack = 'Error: insert failed\n    at https://example.com/path'
    const fields = sanitizeMissingIngestCronLogFields(err)
    expect(fields.sanitizedMessage).toBe('insert failed for [redacted-url]')
    expect(fields.sanitizedStack).toContain('[redacted-url]')
  })

  it('wraps non-Error throws safely', () => {
    const fields = sanitizeMissingIngestCronLogFields('plain string failure')
    expect(fields.sanitizedMessage).toBe('plain string failure')
    expect(fields.sanitizedStack).toBeNull()
  })
})
