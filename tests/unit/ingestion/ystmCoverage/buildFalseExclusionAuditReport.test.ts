import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.hoisted(() => vi.fn())
const mockLoadPublishedIndex = vi.hoisted(() => vi.fn())
const mockPersistTraces = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex', () => ({
  loadLootAuraPublishedYstmIndex: mockLoadPublishedIndex,
}))

vi.mock('@/lib/ingestion/ystmCoverage/persistFalseExclusionTrace', () => ({
  persistFalseExclusionTraces: mockPersistTraces,
}))

const NOW = new Date('2026-06-17T12:00:00.000Z')
const URL = 'https://yardsaletreasuremap.com/US/TX/Austin/1/listing.html'
const INSTANCE_KEY = 'external_page_source:TX|austin|addr:2026-06-10|2026-06-11:1'
const INGESTED_ID = 'ingested-instance-key'

const crawlableConfig = {
  enabled: true,
  source_pages: ['https://yardsaletreasuremap.com/US/Texas/Austin/Austin.html'],
  source_crawl_excluded_at: null,
  source_crawl_last_at: '2026-05-22T08:00:00Z',
}

describe('traceMissingValidFalseExclusions', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
    mockLoadPublishedIndex.mockReset()
    mockPersistTraces.mockReset()
    mockLoadPublishedIndex.mockResolvedValue({ visibleCanonicalUrls: new Set() })
  })

  it('resolves ingested via instance key when source_url alone misses (test 11)', async () => {
    const missingRow = {
      canonical_url: URL,
      state: 'TX',
      city: 'Austin',
      config_key: 'TX|Austin',
      sale_instance_key: INSTANCE_KEY,
      source_listing_id: '1',
      matched_ingested_sale_id: null,
      matched_sale_id: null,
      ystm_invalid_reason: null,
      missing_ingestion_outcome: null,
      missing_ingestion_attempted_at: null,
      missing_ingestion_failure_reason: null,
      missing_ingestion_replay_count: null,
      last_detail_checked_at: '2026-05-22T06:00:00Z',
      false_exclusion_primary_bucket: null,
      list_metadata_snapshot: null,
    }

    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_coverage_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  range: vi.fn().mockResolvedValue({ data: [missingRow], error: null }),
                })),
              })),
            })),
          })),
        }
      }
      if (table === 'ingestion_city_configs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [{ city: 'Austin', state: 'TX', ...crawlableConfig }],
                error: null,
              }),
            })),
          })),
        }
      }
      if (table === 'ingested_sales') {
        return {
          select: vi.fn(() => ({
            in: vi.fn((column: string) => {
              if (column === 'source_url' || column === 'canonical_source_url') {
                return Promise.resolve({ data: [], error: null })
              }
              if (column === 'sale_instance_key') {
                return Promise.resolve({
                  data: [
                    {
                      id: INGESTED_ID,
                      source_url: 'https://other-url.example/listing.html',
                      canonical_source_url: 'https://other-url.example/listing.html',
                      status: 'needs_check',
                      published_sale_id: null,
                      is_duplicate: false,
                      address_status: 'address_available',
                      failure_reasons: [],
                      date_start: '2026-06-10',
                      date_end: '2026-06-11',
                      catalog_repair_outcome: null,
                      source_listing_id: '1',
                      sale_instance_key: INSTANCE_KEY,
                      address_enrichment_attempts: null,
                      next_enrichment_attempt_at: null,
                      address_unlock_at: null,
                      last_address_enrichment_attempt_at: null,
                      superseded_by_ingested_sale_id: null,
                      normalized_address: null,
                    },
                  ],
                  error: null,
                })
              }
              return Promise.resolve({ data: [], error: null })
            }),
            eq: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: INGESTED_ID,
                    source_url: 'https://other-url.example/listing.html',
                    canonical_source_url: 'https://other-url.example/listing.html',
                    status: 'needs_check',
                    published_sale_id: null,
                    is_duplicate: false,
                    address_status: 'address_available',
                    failure_reasons: [],
                    date_start: '2026-06-10',
                    date_end: '2026-06-11',
                    catalog_repair_outcome: null,
                    source_listing_id: '1',
                    sale_instance_key: INSTANCE_KEY,
                    address_enrichment_attempts: null,
                    next_enrichment_attempt_at: null,
                    address_unlock_at: null,
                    last_address_enrichment_attempt_at: null,
                    superseded_by_ingested_sale_id: null,
                    normalized_address: null,
                  },
                ],
                error: null,
              }),
            })),
          })),
        }
      }
      if (table === 'ingested_sale_source_urls') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { traceMissingValidFalseExclusions } = await import(
      '@/lib/ingestion/ystmCoverage/buildFalseExclusionAuditReport'
    )

    const traced = await traceMissingValidFalseExclusions({} as never, NOW, [missingRow])
    expect(traced.traces[0]?.primaryBucket).toBe('repair_pending')
    expect(traced.traces[0]?.evidence.hasIngestedRow).toBe(true)
  })

  it('resolves PNV row via alias bypass when sale_instance_key is stale (V2)', async () => {
    const PA_URL = 'https://yardsaletreasuremap.com/US/CA/Palo%20Alto/1/listing.html'
    const STALE_KEY = 'external_page_source:CA|scotts valley|addr:2026-06-10|2026-06-11:1'
    const INGESTED_KEY = 'external_page_source:CA|palo alto|addr:2026-06-10|2026-06-11:1'

    const missingRow = {
      canonical_url: PA_URL,
      state: 'CA',
      city: 'Palo Alto',
      config_key: 'CA|Palo Alto',
      sale_instance_key: STALE_KEY,
      source_listing_id: '1',
      matched_ingested_sale_id: null,
      matched_sale_id: null,
      ystm_invalid_reason: null,
      missing_ingestion_outcome: 'ingested',
      missing_ingestion_attempted_at: '2026-06-17T10:00:00.000Z',
      missing_ingestion_failure_reason: null,
      missing_ingestion_replay_count: null,
      last_detail_checked_at: '2026-05-22T06:00:00Z',
      false_exclusion_primary_bucket: 'published_not_visible',
      list_metadata_snapshot: null,
    }

    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_coverage_observations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  range: vi.fn().mockResolvedValue({ data: [missingRow], error: null }),
                })),
              })),
            })),
          })),
        }
      }
      if (table === 'ingestion_city_configs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    city: 'Palo Alto',
                    state: 'CA',
                    enabled: true,
                    source_pages: ['https://yardsaletreasuremap.com/US/California/Palo%20Alto/Palo%20Alto.html'],
                    source_crawl_excluded_at: null,
                    source_crawl_last_at: '2026-05-22T08:00:00Z',
                  },
                ],
                error: null,
              }),
            })),
          })),
        }
      }
      if (table === 'ingested_sales') {
        return {
          select: vi.fn(() => ({
            in: vi.fn((column: string) => {
              if (column === 'source_url' || column === 'canonical_source_url') {
                return Promise.resolve({ data: [], error: null })
              }
              if (column === 'id') {
                return Promise.resolve({
                  data: [
                    {
                      id: INGESTED_ID,
                      source_url: 'https://other.example/listing.html',
                      canonical_source_url: 'https://other.example/listing.html',
                      status: 'needs_check',
                      published_sale_id: null,
                      is_duplicate: false,
                      address_status: 'address_gated',
                      failure_reasons: [],
                      date_start: '2026-06-10',
                      date_end: '2026-06-11',
                      catalog_repair_outcome: null,
                      source_listing_id: '1',
                      sale_instance_key: INGESTED_KEY,
                      address_enrichment_attempts: 1,
                      next_enrichment_attempt_at: null,
                      address_unlock_at: '2026-06-20T00:00:00.000Z',
                      last_address_enrichment_attempt_at: null,
                      superseded_by_ingested_sale_id: null,
                      normalized_address: null,
                    },
                  ],
                  error: null,
                })
              }
              return Promise.resolve({ data: [], error: null })
            }),
            eq: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        }
      }
      if (table === 'ingested_sale_source_urls') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [{ ingested_sale_id: INGESTED_ID, canonical_source_url: PA_URL }],
              error: null,
            }),
          })),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const { traceMissingValidFalseExclusions } = await import(
      '@/lib/ingestion/ystmCoverage/buildFalseExclusionAuditReport'
    )

    const traced = await traceMissingValidFalseExclusions({} as never, NOW, [missingRow])
    expect(traced.traces[0]?.evidence.hasIngestedRow).toBe(true)
    expect(traced.traces[0]?.primaryBucket).not.toBe('published_not_visible')
  })
})
