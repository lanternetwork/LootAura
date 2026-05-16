import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { mergeListingTimezoneIntoIngestRawPayload } from '@/lib/reconciliation/syncPublishedSaleFromReconciledSource'

describe('mergeListingTimezoneIntoIngestRawPayload', () => {
  it('returns payload unchanged when listing timezone is empty', () => {
    const raw = { a: 1 }
    expect(mergeListingTimezoneIntoIngestRawPayload(raw, null)).toBe(raw)
    expect(mergeListingTimezoneIntoIngestRawPayload(raw, '  ')).toBe(raw)
  })

  it('shallow-merges listing_timezone into object raw_payload', () => {
    const raw = { foo: 'bar' }
    const out = mergeListingTimezoneIntoIngestRawPayload(raw, ' America/Chicago ') as Record<string, unknown>
    expect(out).not.toBe(raw)
    expect(out.foo).toBe('bar')
    expect(out.listing_timezone).toBe('America/Chicago')
  })

  it('wraps non-object raw_payload as object with listing_timezone only', () => {
    const out = mergeListingTimezoneIntoIngestRawPayload(null, 'America/New_York') as Record<string, unknown>
    expect(out).toEqual({ listing_timezone: 'America/New_York' })
  })
})

describe('Phase 2A ingest schedule mirror (static)', () => {
  it('runs mirror only after successful schedule write (not when inhibited)', () => {
    const path = join(process.cwd(), 'lib/reconciliation/syncPublishedSaleFromReconciledSource.ts')
    const src = readFileSync(path, 'utf8')
    expect(src).toMatch(/built\.schedulesUpdated && !built\.scheduleMutationInhibited/)
  })
})
