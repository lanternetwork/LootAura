import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessedIngestedSale } from '@/lib/ingestion/types'

const mockFromBase = vi.fn()
const loggerInfo = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfo(...args),
  },
}))

vi.mock('@/lib/observability/emit', () => ({
  buildTelemetryRecord: (_event: string, fields: Record<string, unknown>) => ({ event: _event, ...fields }),
  emitObservabilityRecord: vi.fn(),
}))

function processedBase(overrides: Partial<ProcessedIngestedSale> = {}): ProcessedIngestedSale {
  return {
    normalizedAddress: '123 Main St',
    resolvedAddressRaw: '123 Main St',
    city: 'Louisville',
    state: 'KY',
    lat: null,
    lng: null,
    dateStart: '2026-05-10',
    dateEnd: null,
    timeStart: '09:00:00',
    timeEnd: null,
    timeSource: 'explicit',
    dateSource: 'parsed',
    status: 'needs_geocode',
    failureReasons: [],
    parseConfidence: 'high',
    ...overrides,
  }
}

function sourceLookupRow(id: string | null) {
  const rows = id ? [{ id }] : []
  return {
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  }
}

function exactLookupRow(id: string | null) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: id ? { id } : null }),
        }),
      }),
    }),
  }
}

function softLookupRows(
  rows: Array<{
    id: string
    date_start: string
    title?: string | null
    external_id?: string | null
    source_platform?: string | null
    image_source_url?: string | null
  }>
) {
  const enriched = rows.map((r) => ({
    id: r.id,
    date_start: r.date_start,
    date_end: null,
    title: r.title ?? null,
    source_platform: r.source_platform ?? null,
    external_id: r.external_id ?? null,
    lat: null as number | null,
    lng: null as number | null,
    image_source_url: r.image_source_url ?? null,
    source_url: null,
    canonical_source_url: null,
    sale_instance_key: null,
    source_listing_id: null,
    source_location_hash: null,
    status: null,
    failure_reasons: null,
  }))
  return {
    select: () => ({
      eq: () => ({
        not: () => ({
          gte: () => ({
            lte: () => ({
              order: () => ({
                limit: async () => ({ data: enriched }),
              }),
            }),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
}

function suppressionEvidenceInsert() {
  return { insert: vi.fn().mockResolvedValue({ error: null }) }
}

describe('findIngestedSaleMatch telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('source_url match emits source_url decision', async () => {
    mockFromBase.mockReturnValueOnce(sourceLookupRow('source-match-id'))

    const { findIngestedSaleMatch } = await import('@/lib/ingestion/dedupe')
    const { match } = await findIngestedSaleMatch('https://private.example/source', processedBase(), {
      sourcePlatform: 'external_page_source',
    })

    expect(match).toEqual({
      id: 'source-match-id',
      matchType: 'source_url',
      duplicateConfidence: 'exact_duplicate',
      suppressAsDuplicate: false,
    })
    expect(loggerInfo).toHaveBeenCalledWith(
      'Ingested sale dedupe decision',
      expect.objectContaining({
        matchType: 'source_url',
        duplicateDecision: false,
        sourcePlatform: 'external_page_source',
      })
    )
  })

  it('exact address/date match emits exact decision', async () => {
    mockFromBase.mockReturnValueOnce(sourceLookupRow(null)).mockReturnValueOnce(exactLookupRow('exact-match-id'))

    const { findIngestedSaleMatch } = await import('@/lib/ingestion/dedupe')
    const { match } = await findIngestedSaleMatch('https://private.example/source', processedBase())

    expect(match).toEqual({
      id: 'exact-match-id',
      matchType: 'address_date',
      duplicateConfidence: 'exact_duplicate',
      suppressAsDuplicate: false,
    })
    expect(loggerInfo).toHaveBeenCalledWith(
      'Ingested sale dedupe decision',
      expect.objectContaining({
        matchType: 'exact_address_date',
        duplicateDecision: false,
      })
    )
  })

  it('soft ±1 day match emits soft_date_window decision when score suppresses', async () => {
    mockFromBase
      .mockReturnValueOnce(sourceLookupRow(null))
      .mockReturnValueOnce(exactLookupRow(null))
      .mockReturnValueOnce(
        softLookupRows([{ id: 'soft-match-id', date_start: '2026-05-11', external_id: '42' }])
      )
      .mockReturnValueOnce(suppressionEvidenceInsert())

    const { findIngestedSaleMatch } = await import('@/lib/ingestion/dedupe')
    // Use a long enough normalized address so weak-address scoring does not raise the suppress bar above the fixture score.
    const { match } = await findIngestedSaleMatch(
      'https://private.example/source',
      processedBase({ normalizedAddress: '123 main street louisville ky' }),
      {
        normalizedTitle: 'Distinctive neighborhood tools sale weekend',
        externalId: '42',
        sourcePlatform: 'external_page_source',
      }
    )

    expect(match).toEqual({
      id: 'soft-match-id',
      matchType: 'soft_address_date',
      duplicateConfidence: 'recurring_repost',
      suppressAsDuplicate: true,
    })
    expect(loggerInfo).toHaveBeenCalledWith(
      'Ingested sale dedupe decision',
      expect.objectContaining({
        matchType: 'soft_date_window',
        duplicateDecision: true,
        dateDeltaBucket: 'plus_1_day',
      })
    )
  })

  it('no match emits none', async () => {
    mockFromBase
      .mockReturnValueOnce(sourceLookupRow(null))
      .mockReturnValueOnce(exactLookupRow(null))
      .mockReturnValueOnce(softLookupRows([]))

    const { findIngestedSaleMatch } = await import('@/lib/ingestion/dedupe')
    const { match } = await findIngestedSaleMatch('https://private.example/source', processedBase())

    expect(match).toBeNull()
    expect(loggerInfo).toHaveBeenCalledWith(
      'Ingested sale dedupe decision',
      expect.objectContaining({
        matchType: 'none',
        duplicateDecision: false,
      })
    )
  })

  it('logs contain no raw address/title/source URL', async () => {
    mockFromBase
      .mockReturnValueOnce(sourceLookupRow(null))
      .mockReturnValueOnce(exactLookupRow(null))
      .mockReturnValueOnce(softLookupRows([]))

    const sensitiveAddress = '999 Secret Address Ave'
    const sensitiveSource = 'https://super-private.example.com/path'
    const sensitiveTitle = 'PRIVATE YARD SALE TITLE'
    const { findIngestedSaleMatch } = await import('@/lib/ingestion/dedupe')
    await findIngestedSaleMatch(
      sensitiveSource,
      processedBase({
        normalizedAddress: sensitiveAddress,
      }),
      { sourcePlatform: 'manual_upload', normalizedTitle: sensitiveTitle }
    )

    const call = loggerInfo.mock.calls.at(-1)
    const payload = call?.[1] as Record<string, unknown>
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain(sensitiveAddress)
    expect(serialized).not.toContain(sensitiveSource)
    expect(serialized).not.toContain(sensitiveTitle)
    expect(payload).toEqual(
      expect.objectContaining({
        matchType: 'none',
        sourcePlatform: 'manual_upload',
      })
    )
  })
})

describe('dedupe telemetry aggregation', () => {
  it('aggregation counts increment correctly', async () => {
    const {
      accumulateDedupeDecisionAggregate,
      createEmptyDedupeDecisionAggregate,
    } = await import('@/lib/ingestion/dedupe')
    const agg = createEmptyDedupeDecisionAggregate()

    accumulateDedupeDecisionAggregate(agg, {
      id: '1',
      matchType: 'source_url',
      duplicateConfidence: 'exact_duplicate',
      suppressAsDuplicate: false,
    })
    accumulateDedupeDecisionAggregate(agg, {
      id: '2',
      matchType: 'address_date',
      duplicateConfidence: 'exact_duplicate',
      suppressAsDuplicate: false,
    })
    accumulateDedupeDecisionAggregate(agg, {
      id: '3',
      matchType: 'soft_address_date',
      duplicateConfidence: 'probable_duplicate',
      suppressAsDuplicate: true,
    })
    accumulateDedupeDecisionAggregate(agg, null)
    accumulateDedupeDecisionAggregate(agg, null, { softScoringRejected: true })

    expect(agg).toEqual({
      source_url: 1,
      exact_address_date: 1,
      soft_date_window: 1,
      soft_duplicate_rejected: 1,
      no_match: 1,
      duplicateDecisionTrue: 1,
      duplicateDecisionFalse: 4,
    })
  })

  it('aggregation output remains bounded and non-PII', async () => {
    const { createEmptyDedupeDecisionAggregate } = await import('@/lib/ingestion/dedupe')
    const agg = createEmptyDedupeDecisionAggregate()
    expect(Object.keys(agg).sort()).toEqual([
      'duplicateDecisionFalse',
      'duplicateDecisionTrue',
      'exact_address_date',
      'no_match',
      'soft_date_window',
      'soft_duplicate_rejected',
      'source_url',
    ])
  })
})
