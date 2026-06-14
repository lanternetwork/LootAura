import { describe, expect, it } from 'vitest'
import {
  compareCatalogRepairCandidatePriority,
  isCatalogRepairCandidateRow,
  isEligibleForCatalogRepairRetry,
} from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairCandidates'

const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

describe('ystmCatalogRepairCandidates', () => {
  const nowMs = Date.parse('2026-05-18T12:00:00.000Z')

  it('accepts repairable YSTM rows without published_sale_id', () => {
    expect(
      isCatalogRepairCandidateRow({
        source_url: DETAIL_URL,
        status: 'needs_geocode',
        published_sale_id: null,
      })
    ).toBe(true)
  })

  it('rejects non-detail URLs', () => {
    expect(
      isCatalogRepairCandidateRow({
        source_url: 'https://example.com/x',
        status: 'needs_geocode',
        published_sale_id: null,
      })
    ).toBe(false)
  })

  it('rejects ready rows that already have published_sale_id', () => {
    expect(
      isCatalogRepairCandidateRow({
        source_url: DETAIL_URL,
        status: 'ready',
        published_sale_id: 'sale-1',
      })
    ).toBe(false)
  })

  it('prioritizes publish_failed before address-gated needs_check', () => {
    expect(
      compareCatalogRepairCandidatePriority(
        { status: 'publish_failed', addressStatus: null, ingestedSaleId: 'b' },
        { status: 'needs_check', addressStatus: 'address_gated', ingestedSaleId: 'a' }
      )
    ).toBeLessThan(0)
    expect(
      compareCatalogRepairCandidatePriority(
        { status: 'needs_check', addressStatus: 'address_gated', ingestedSaleId: 'a' },
        { status: 'needs_check', addressStatus: null, ingestedSaleId: 'b' }
      )
    ).toBeLessThan(0)
    expect(
      compareCatalogRepairCandidatePriority(
        { status: 'needs_geocode', addressStatus: null, ingestedSaleId: 'a' },
        { status: 'ready', addressStatus: null, ingestedSaleId: 'b' }
      )
    ).toBeLessThan(0)
  })

  it('retries failed repair outcomes after cooldown', () => {
    expect(
      isEligibleForCatalogRepairRetry(
        {
          catalogRepairOutcome: 'failed',
          catalogRepairAttemptedAt: '2026-05-18T04:00:00.000Z',
        },
        nowMs,
        6
      )
    ).toBe(true)
    expect(
      isEligibleForCatalogRepairRetry(
        {
          catalogRepairOutcome: 'failed',
          catalogRepairAttemptedAt: '2026-05-18T10:30:00.000Z',
        },
        nowMs,
        6
      )
    ).toBe(false)
  })
})
