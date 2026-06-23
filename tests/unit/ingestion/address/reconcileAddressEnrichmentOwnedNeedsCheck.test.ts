import { describe, expect, it } from 'vitest'

import { MAX_ADDRESS_ENRICHMENT_ATTEMPTS } from '@/lib/ingestion/address/addressLifecycleTypes'
import { classifyAddressEnrichmentOwnedNeedsCheckReconciliation } from '@/lib/ingestion/address/reconcileAddressEnrichmentOwnedNeedsCheck'

const NOW_MS = Date.parse('2026-06-22T12:00:00.000Z')
const SOURCE_URL = 'https://www.yardsaletreasuremap.com/sale/gated-1'

function row(
  overrides: Partial<Parameters<typeof classifyAddressEnrichmentOwnedNeedsCheckReconciliation>[0]> = {}
) {
  return {
    status: 'needs_check',
    address_status: 'address_gated',
    source_url: SOURCE_URL,
    address_enrichment_attempts: 0,
    next_enrichment_attempt_at: null,
    address_unlock_at: null,
    last_address_enrichment_attempt_at: null,
    ...overrides,
  }
}

describe('classifyAddressEnrichmentOwnedNeedsCheckReconciliation', () => {
  it('reclassifies recoverable gated row when unlock elapsed and claimable', () => {
    expect(classifyAddressEnrichmentOwnedNeedsCheckReconciliation(row(), NOW_MS)).toBe(
      'reclassify_pending'
    )
  })

  it('leaves gated row unchanged when unlock is still in the future', () => {
    expect(
      classifyAddressEnrichmentOwnedNeedsCheckReconciliation(
        row({
          address_unlock_at: '2026-12-01T06:00:00.000Z',
        }),
        NOW_MS
      )
    ).toBe('noop')
  })

  it('terminalizes gated row when attempts are exhausted', () => {
    expect(
      classifyAddressEnrichmentOwnedNeedsCheckReconciliation(
        row({ address_enrichment_attempts: MAX_ADDRESS_ENRICHMENT_ATTEMPTS }),
        NOW_MS
      )
    ).toBe('terminal')
  })

  it('leaves retry row unchanged when still claimable', () => {
    expect(
      classifyAddressEnrichmentOwnedNeedsCheckReconciliation(
        row({
          address_status: 'address_enrichment_retry',
          address_enrichment_attempts: 2,
        }),
        NOW_MS
      )
    ).toBe('noop')
  })

  it('terminalizes exhausted retry row', () => {
    expect(
      classifyAddressEnrichmentOwnedNeedsCheckReconciliation(
        row({
          address_status: 'address_enrichment_retry',
          address_enrichment_attempts: MAX_ADDRESS_ENRICHMENT_ATTEMPTS,
        }),
        NOW_MS
      )
    ).toBe('terminal')
  })

  it('noops for non-enrichment-owned statuses', () => {
    expect(
      classifyAddressEnrichmentOwnedNeedsCheckReconciliation(
        row({ address_status: 'address_terminal_active' }),
        NOW_MS
      )
    ).toBe('noop')
  })
})
