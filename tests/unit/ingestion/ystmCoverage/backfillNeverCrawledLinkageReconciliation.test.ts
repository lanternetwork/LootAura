import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublishedNotVisibleSaleRow } from '@/lib/admin/publishedNotVisibleDistributionTypes'
import { classifyFalseExclusionTrace } from '@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace'
import {
  buildNeverCrawledLinkageReconciliationUpdate,
  type NeverCrawledLinkageObservationRow,
} from '@/lib/ingestion/ystmCoverage/backfillNeverCrawledLinkageReconciliation'

const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

const NOW_ISO = '2026-06-17T12:00:00.000Z'
const NOW_MS = Date.parse(NOW_ISO)
const URL = 'https://yardsaletreasuremap.com/US/TX/Austin/1/listing.html'
const SALE_ID = 'sale-visible-1'
const INGESTED_ID = 'ingested-1'

const crawlableConfig = {
  enabled: true,
  source_pages: ['https://yardsaletreasuremap.com/US/Texas/Austin/Austin.html'],
  source_crawl_excluded_at: null,
  source_crawl_last_at: '2026-05-22T08:00:00Z',
}

function baseObservation(overrides: Partial<NeverCrawledLinkageObservationRow> = {}): NeverCrawledLinkageObservationRow {
  return {
    canonical_url: URL,
    state: 'TX',
    city: 'Austin',
    config_key: 'TX|Austin',
    sale_instance_key: 'key-1',
    source_listing_id: '1',
    matched_ingested_sale_id: null,
    matched_sale_id: null,
    missing_ingestion_outcome: null,
    missing_ingestion_attempted_at: null,
    missing_ingestion_failure_reason: null,
    last_detail_checked_at: '2026-05-22T06:00:00Z',
    list_metadata_snapshot: null,
    ...overrides,
  }
}

function ingestedSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: INGESTED_ID,
    source_url: URL,
    status: 'needs_check',
    published_sale_id: null,
    is_duplicate: false,
    address_status: 'address_available',
    failure_reasons: [],
    date_start: '2026-06-10',
    date_end: '2026-06-11',
    catalog_repair_outcome: null,
    source_listing_id: '1',
    sale_instance_key: 'key-1',
    address_enrichment_attempts: null,
    next_enrichment_attempt_at: null,
    address_unlock_at: null,
    last_address_enrichment_attempt_at: null,
    ...overrides,
  }
}

function classified(ingested: ReturnType<typeof ingestedSnapshot>) {
  return classifyFalseExclusionTrace({
    observation: {
      canonicalUrl: URL,
      state: 'TX',
      city: 'Austin',
      configKey: 'TX|Austin',
      missingIngestionOutcome: null,
      missingIngestionAttemptedAt: null,
      missingIngestionFailureReason: null,
      lastDetailCheckedAt: '2026-05-22T06:00:00Z',
    },
    ingested,
    config: crawlableConfig,
    visibleInPublishedIndex: false,
    nowIso: NOW_ISO,
  })
}

const VISIBLE_SALE: PublishedNotVisibleSaleRow = {
  id: SALE_ID,
  status: 'published',
  archived_at: null,
  ends_at: '2027-01-01T00:00:00.000Z',
  moderation_status: null,
}

const HIDDEN_SALE: PublishedNotVisibleSaleRow = {
  id: SALE_ID,
  status: 'published',
  archived_at: null,
  ends_at: '2027-01-01T00:00:00.000Z',
  moderation_status: 'hidden_by_admin',
}

describe('buildNeverCrawledLinkageReconciliationUpdate', () => {
  it('sets visible linkage when published sale passes phase 4 (test 4)', () => {
    const ingested = ingestedSnapshot({ published_sale_id: SALE_ID })
    const patch = buildNeverCrawledLinkageReconciliationUpdate({
      resolved: { ingested, matchMethod: 'sale_instance_key' },
      classified: classified(ingested),
      linkedSale: VISIBLE_SALE,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      linkageOnly: false,
    })
    expect(patch).toMatchObject({
      matched_ingested_sale_id: INGESTED_ID,
      matched_sale_id: SALE_ID,
      match_method: 'sale_instance_key',
      lootaura_visible: true,
      false_exclusion_primary_bucket: null,
    })
  })

  it('reclassifies expired ingested to expired_false_positive (test 5, 9)', () => {
    const ingested = ingestedSnapshot({
      status: 'expired',
      failure_reasons: ['sale_expired'],
    })
    const patch = buildNeverCrawledLinkageReconciliationUpdate({
      resolved: { ingested, matchMethod: 'sale_instance_key' },
      classified: classified(ingested),
      linkedSale: null,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      linkageOnly: false,
    })
    expect(patch).toMatchObject({
      matched_ingested_sale_id: INGESTED_ID,
      lootaura_visible: false,
      false_exclusion_primary_bucket: 'expired_false_positive',
    })
  })

  it('reclassifies terminal-archived ingested (test 10)', () => {
    const ingested = ingestedSnapshot({
      status: 'expired',
      address_status: 'address_terminal_archived',
      failure_reasons: ['sale_expired'],
    })
    const patch = buildNeverCrawledLinkageReconciliationUpdate({
      resolved: { ingested, matchMethod: 'sale_instance_key' },
      classified: classified(ingested),
      linkedSale: null,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      linkageOnly: false,
    })
    expect(patch?.false_exclusion_primary_bucket).toBe('terminal_disposition')
    expect(patch?.lootaura_visible).toBe(false)
  })

  it('reclassify-only pass does not set linkage fields (test 12)', () => {
    const ingested = ingestedSnapshot({ status: 'expired', failure_reasons: ['sale_expired'] })
    const patch = buildNeverCrawledLinkageReconciliationUpdate({
      resolved: { ingested, matchMethod: 'sale_instance_key' },
      classified: classified(ingested),
      linkedSale: null,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      linkageOnly: true,
    })
    expect(patch).not.toHaveProperty('matched_ingested_sale_id')
    expect(patch).not.toHaveProperty('match_method')
    expect(patch?.false_exclusion_primary_bucket).toBe('expired_false_positive')
  })

  it('does not flip visibility for hidden linked sale (test 13)', () => {
    const ingested = ingestedSnapshot({ published_sale_id: SALE_ID })
    const patch = buildNeverCrawledLinkageReconciliationUpdate({
      resolved: { ingested, matchMethod: 'sale_instance_key' },
      classified: classified(ingested),
      linkedSale: HIDDEN_SALE,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      linkageOnly: false,
    })
    expect(patch?.lootaura_visible).toBe(false)
    expect(patch?.false_exclusion_primary_bucket).toBe('published_not_visible')
  })
})

function ingestedDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INGESTED_ID,
    source_url: URL,
    canonical_source_url: URL,
    status: 'needs_check',
    published_sale_id: null,
    is_duplicate: false,
    address_status: 'address_available',
    failure_reasons: [],
    date_start: '2026-06-10',
    date_end: '2026-06-11',
    catalog_repair_outcome: null,
    source_listing_id: '1',
    sale_instance_key: 'key-1',
    address_enrichment_attempts: null,
    next_enrichment_attempt_at: null,
    address_unlock_at: null,
    last_address_enrichment_attempt_at: null,
    superseded_by_ingested_sale_id: null,
    normalized_address: null,
    ...overrides,
  }
}

function setupBackfillMocks(options: {
  linkageCohort: NeverCrawledLinkageObservationRow[]
  reclassifyCohort?: NeverCrawledLinkageObservationRow[]
  ingestedRows?: ReturnType<typeof ingestedDbRow>[]
  updateResults?: Array<{ error: { message: string } | null }>
}) {
  const {
    linkageCohort,
    reclassifyCohort = [],
    ingestedRows = [ingestedDbRow()],
    updateResults = [],
  } = options

  const updates: unknown[] = []
  const updatedTables: string[] = []
  let updateCallIndex = 0
  let linkagePass = true

  function observationQueryChain() {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      range: vi.fn(() => chain),
      is: vi.fn(() => {
        linkagePass = true
        return chain
      }),
      not: vi.fn(() => {
        linkagePass = false
        return chain
      }),
      then(
        onFulfilled: (value: { data: unknown; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) {
        const cohort = linkagePass ? linkageCohort : reclassifyCohort
        return Promise.resolve({ data: cohort, error: null }).then(onFulfilled, onRejected)
      },
    }
    return chain
  }

  mockFromBase.mockImplementation((_admin, table: string) => {
    if (table === 'ystm_coverage_observations') {
      return {
        ...observationQueryChain(),
        update: vi.fn((payload: unknown) => {
          updates.push(payload)
          updatedTables.push(table)
          const result = updateResults[updateCallIndex] ?? { error: null }
          updateCallIndex += 1
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn().mockResolvedValue(result),
                })),
              })),
            })),
          }
        }),
      }
    }
    if (table === 'ingestion_city_configs') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  city: 'Austin',
                  state: 'TX',
                  ...crawlableConfig,
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
          in: vi.fn(() => Promise.resolve({ data: ingestedRows, error: null })),
          eq: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: ingestedRows, error: null })),
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
    if (table === 'sales') {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return { updates, updatedTables }
}

describe('backfillNeverCrawledLinkageReconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
  })

  it('links never_crawled row via sale_instance_key (test 1 integration)', async () => {
    const { updates } = setupBackfillMocks({
      linkageCohort: [baseObservation()],
    })

    const { backfillNeverCrawledLinkageReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillNeverCrawledLinkageReconciliation'
    )

    const result = await backfillNeverCrawledLinkageReconciliation({} as never, NOW_ISO, NOW_MS)
    expect(result.updated).toBe(1)
    expect(updates[0]).toMatchObject({
      matched_ingested_sale_id: INGESTED_ID,
      match_method: 'sale_instance_key',
      lootaura_visible: false,
    })
  })

  it('is idempotent on re-run (test 7)', async () => {
    const { updates } = setupBackfillMocks({
      linkageCohort: [],
      reclassifyCohort: [],
    })

    const { backfillNeverCrawledLinkageReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillNeverCrawledLinkageReconciliation'
    )

    const result = await backfillNeverCrawledLinkageReconciliation({} as never, NOW_ISO, NOW_MS)
    expect(result).toEqual({
      scanned: 0,
      updated: 0,
      linkageUpdated: 0,
      reclassifyOnlyUpdated: 0,
      visibleUpdated: 0,
    })
    expect(updates).toHaveLength(0)
  })

  it('does not mutate ingested_sales or sales tables (test 8)', async () => {
    const { updatedTables } = setupBackfillMocks({
      linkageCohort: [baseObservation()],
    })

    const { backfillNeverCrawledLinkageReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillNeverCrawledLinkageReconciliation'
    )

    await backfillNeverCrawledLinkageReconciliation({} as never, NOW_ISO, NOW_MS)
    expect(updatedTables.every((t) => t === 'ystm_coverage_observations')).toBe(true)
  })
})
