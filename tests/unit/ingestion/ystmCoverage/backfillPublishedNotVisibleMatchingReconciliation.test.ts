import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublishedNotVisibleSaleRow } from '@/lib/admin/publishedNotVisibleDistributionTypes'
import { classifyFalseExclusionTrace } from '@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace'
import {
  buildPublishedNotVisibleMatchingLinkageUpdate,
  buildPublishedNotVisibleMatchingReconciliationUpdate,
  type PublishedNotVisibleMatchingObservationRow,
} from '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleMatchingReconciliation'

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

function baseObservation(
  overrides: Partial<PublishedNotVisibleMatchingObservationRow> = {}
): PublishedNotVisibleMatchingObservationRow {
  return {
    canonical_url: URL,
    state: 'TX',
    city: 'Austin',
    config_key: 'TX|Austin',
    sale_instance_key: 'key-1',
    source_listing_id: '1',
    matched_ingested_sale_id: null,
    matched_sale_id: null,
    missing_ingestion_outcome: 'ingested',
    missing_ingestion_attempted_at: '2026-06-17T10:00:00.000Z',
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
    address_status: 'address_gated',
    failure_reasons: [],
    date_start: '2026-06-10',
    date_end: '2026-06-11',
    catalog_repair_outcome: null,
    source_listing_id: '1',
    sale_instance_key: 'key-1',
    address_enrichment_attempts: 1,
    next_enrichment_attempt_at: null,
    address_unlock_at: '2026-06-20T00:00:00.000Z',
    last_address_enrichment_attempt_at: null,
    ...overrides,
  }
}

function classified(
  ingested: ReturnType<typeof ingestedSnapshot>,
  observationOverrides: Partial<{
    missingIngestionOutcome: string | null
    missingIngestionAttemptedAt: string | null
  }> = {}
) {
  return classifyFalseExclusionTrace({
    observation: {
      canonicalUrl: URL,
      state: 'TX',
      city: 'Austin',
      configKey: 'TX|Austin',
      missingIngestionOutcome: observationOverrides.missingIngestionOutcome ?? 'ingested',
      missingIngestionAttemptedAt:
        observationOverrides.missingIngestionAttemptedAt ?? '2026-06-17T10:00:00.000Z',
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

describe('buildPublishedNotVisibleMatchingLinkageUpdate', () => {
  it('persists linkage columns only (pass 1)', () => {
    const ingested = ingestedSnapshot()
    const patch = buildPublishedNotVisibleMatchingLinkageUpdate({
      resolved: { ingested, matchMethod: 'source_url_alias' },
      nowIso: NOW_ISO,
    })
    expect(patch).toEqual({
      matched_ingested_sale_id: INGESTED_ID,
      match_method: 'source_url_alias',
      updated_at: NOW_ISO,
    })
    expect(patch).not.toHaveProperty('false_exclusion_primary_bucket')
    expect(patch).not.toHaveProperty('lootaura_visible')
  })
})

describe('buildPublishedNotVisibleMatchingReconciliationUpdate', () => {
  it('sets visible linkage when published sale passes phase 4', () => {
    const ingested = ingestedSnapshot({ published_sale_id: SALE_ID, address_status: 'address_available' })
    const patch = buildPublishedNotVisibleMatchingReconciliationUpdate({
      resolved: { ingested, matchMethod: 'source_url_alias' },
      classified: classified(ingested),
      linkedSale: VISIBLE_SALE,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      hadLinkageBefore: true,
    })
    expect(patch).toMatchObject({
      matched_ingested_sale_id: INGESTED_ID,
      matched_sale_id: SALE_ID,
      match_method: 'source_url_alias',
      lootaura_visible: true,
      false_exclusion_primary_bucket: null,
    })
  })

  it('reclassifies gated ingested to gated_false_positive or schedule_wait', () => {
    const ingested = ingestedSnapshot()
    const patch = buildPublishedNotVisibleMatchingReconciliationUpdate({
      resolved: { ingested, matchMethod: 'source_url_alias' },
      classified: classified(ingested),
      linkedSale: null,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      hadLinkageBefore: true,
    })
    expect(patch?.lootaura_visible).toBe(false)
    expect(['gated_false_positive', 'schedule_wait']).toContain(
      patch?.false_exclusion_primary_bucket
    )
  })

  it('reclassifies expired ingested to url_reuse_suspected when outcome is ingested', () => {
    const ingested = ingestedSnapshot({ status: 'expired', address_status: 'address_terminal_archived' })
    const patch = buildPublishedNotVisibleMatchingReconciliationUpdate({
      resolved: { ingested, matchMethod: 'source_url_alias' },
      classified: classified(ingested),
      linkedSale: null,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      hadLinkageBefore: true,
    })
    expect(patch?.false_exclusion_primary_bucket).toBe('url_reuse_suspected')
    expect(patch?.lootaura_visible).toBe(false)
  })

  it('skips no-op when bucket remains published_not_visible (hidden linked sale)', () => {
    const ingested = ingestedSnapshot({ published_sale_id: SALE_ID, address_status: 'address_available' })
    const patch = buildPublishedNotVisibleMatchingReconciliationUpdate({
      resolved: { ingested, matchMethod: 'source_url_alias' },
      classified: classified(ingested),
      linkedSale: HIDDEN_SALE,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      hadLinkageBefore: true,
    })
    expect(patch).toBeNull()
  })

  it('includes linkage fields when hadLinkageBefore is false', () => {
    const ingested = ingestedSnapshot({ address_status: 'address_terminal_active', status: 'needs_check' })
    const result = classified(ingested)
    const patch = buildPublishedNotVisibleMatchingReconciliationUpdate({
      resolved: { ingested, matchMethod: 'source_url_alias' },
      classified: result,
      linkedSale: null,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      hadLinkageBefore: false,
    })
    expect(patch).toMatchObject({
      matched_ingested_sale_id: INGESTED_ID,
      match_method: 'source_url_alias',
      false_exclusion_primary_bucket: 'terminal_disposition',
    })
  })

  it('does not include linkage fields when hadLinkageBefore is true', () => {
    const ingested = ingestedSnapshot({ address_status: 'address_terminal_active', status: 'needs_check' })
    const patch = buildPublishedNotVisibleMatchingReconciliationUpdate({
      resolved: { ingested, matchMethod: 'source_url_alias' },
      classified: classified(ingested),
      linkedSale: null,
      nowIso: NOW_ISO,
      nowMs: NOW_MS,
      hadLinkageBefore: true,
    })
    expect(patch).not.toHaveProperty('matched_ingested_sale_id')
    expect(patch).not.toHaveProperty('match_method')
    expect(patch?.false_exclusion_primary_bucket).toBe('terminal_disposition')
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
    address_status: 'address_gated',
    failure_reasons: [],
    date_start: '2026-06-10',
    date_end: '2026-06-11',
    catalog_repair_outcome: null,
    source_listing_id: '1',
    sale_instance_key: 'key-1',
    address_enrichment_attempts: 1,
    next_enrichment_attempt_at: null,
    address_unlock_at: '2026-06-20T00:00:00.000Z',
    last_address_enrichment_attempt_at: null,
    superseded_by_ingested_sale_id: null,
    normalized_address: null,
    ...overrides,
  }
}

function setupBackfillMocks(options: {
  linkageCohort: PublishedNotVisibleMatchingObservationRow[]
  reclassifyCohort?: PublishedNotVisibleMatchingObservationRow[]
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
  let fetchPass = 0

  function observationQueryChain() {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      range: vi.fn(() => chain),
      is: vi.fn(() => chain),
      then(
        onFulfilled: (value: { data: unknown; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) {
        const cohort = fetchPass === 0 ? linkageCohort : reclassifyCohort
        fetchPass += 1
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
          function updateTerminal() {
            const terminal = {
              is: vi.fn().mockResolvedValue(result),
              then(
                onFulfilled: (value: { data: unknown; error: typeof result.error }) => unknown,
                onRejected?: (reason: unknown) => unknown
              ) {
                return Promise.resolve({ data: null, error: result.error }).then(onFulfilled, onRejected)
              },
            }
            return terminal
          }
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => updateTerminal()),
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

describe('backfillPublishedNotVisibleMatchingReconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
  })

  it('pass 1 links published_not_visible row via source_url_alias', async () => {
    const observation = baseObservation()
    const { updates } = setupBackfillMocks({
      linkageCohort: [observation],
      reclassifyCohort: [{ ...observation, matched_ingested_sale_id: INGESTED_ID }],
    })

    const { backfillPublishedNotVisibleMatchingReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleMatchingReconciliation'
    )

    const result = await backfillPublishedNotVisibleMatchingReconciliation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )
    expect(result.linkageUpdated).toBe(1)
    expect(updates[0]).toMatchObject({
      matched_ingested_sale_id: INGESTED_ID,
      match_method: 'source_url_alias',
    })
    expect(updates[0]).not.toHaveProperty('false_exclusion_primary_bucket')
  })

  it('pass 2 reclassifies linked row out of published_not_visible', async () => {
    const observation = baseObservation({ matched_ingested_sale_id: INGESTED_ID })
    const { updates } = setupBackfillMocks({
      linkageCohort: [],
      reclassifyCohort: [observation],
      ingestedRows: [ingestedDbRow({ address_status: 'address_terminal_active', status: 'needs_check' })],
    })

    const { backfillPublishedNotVisibleMatchingReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleMatchingReconciliation'
    )

    const result = await backfillPublishedNotVisibleMatchingReconciliation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )
    expect(result.reclassifyOnlyUpdated).toBe(1)
    expect(updates[0]).toMatchObject({
      false_exclusion_primary_bucket: 'terminal_disposition',
      lootaura_visible: false,
    })
  })

  it('is idempotent on empty cohort', async () => {
    const { updates } = setupBackfillMocks({
      linkageCohort: [],
      reclassifyCohort: [],
    })

    const { backfillPublishedNotVisibleMatchingReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleMatchingReconciliation'
    )

    const result = await backfillPublishedNotVisibleMatchingReconciliation(
      {} as never,
      NOW_ISO,
      NOW_MS
    )
    expect(result).toEqual({
      scanned: 0,
      updated: 0,
      linkageUpdated: 0,
      reclassifyOnlyUpdated: 0,
      visibleUpdated: 0,
    })
    expect(updates).toHaveLength(0)
  })

  it('does not mutate ingested_sales or sales tables', async () => {
    const { updatedTables } = setupBackfillMocks({
      linkageCohort: [baseObservation()],
      reclassifyCohort: [],
    })

    const { backfillPublishedNotVisibleMatchingReconciliation } = await import(
      '@/lib/ingestion/ystmCoverage/backfillPublishedNotVisibleMatchingReconciliation'
    )

    await backfillPublishedNotVisibleMatchingReconciliation({} as never, NOW_ISO, NOW_MS)
    expect(updatedTables.every((t) => t === 'ystm_coverage_observations')).toBe(true)
  })
})
