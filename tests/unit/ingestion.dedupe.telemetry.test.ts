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

function processedBase(overrides: Partial<ProcessedIngestedSale> = {}): ProcessedIngestedSale {
  return {
    normalizedAddress: '123 Main St',
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
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: id ? { id } : null }),
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

function softLookupRows(rows: Array<{ id: string; date_start: string }>) {
  return {
    select: () => ({
      eq: () => ({
        not: () => ({
          limit: async () => ({ data: rows }),
        }),
      }),
    }),
  }
}

describe('findIngestedSaleMatch telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('source_url match emits source_url decision', async () => {
    mockFromBase
      .mockReturnValueOnce(sourceLookupRow('source-match-id'))

    const { findIngestedSaleMatch } = await import('@/lib/ingestion/dedupe')
    const result = await findIngestedSaleMatch('https://private.example/source', processedBase(), {
      sourcePlatform: 'external_page_source',
    })

    expect(result).toEqual({ id: 'source-match-id', matchType: 'source_url' })
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
    mockFromBase
      .mockReturnValueOnce(sourceLookupRow(null))
      .mockReturnValueOnce(exactLookupRow('exact-match-id'))

    const { findIngestedSaleMatch } = await import('@/lib/ingestion/dedupe')
    const result = await findIngestedSaleMatch('https://private.example/source', processedBase())

    expect(result).toEqual({ id: 'exact-match-id', matchType: 'address_date' })
    expect(loggerInfo).toHaveBeenCalledWith(
      'Ingested sale dedupe decision',
      expect.objectContaining({
        matchType: 'exact_address_date',
        duplicateDecision: false,
      })
    )
  })

  it('soft ±1 day match emits soft_date_window decision', async () => {
    mockFromBase
      .mockReturnValueOnce(sourceLookupRow(null))
      .mockReturnValueOnce(exactLookupRow(null))
      .mockReturnValueOnce(softLookupRows([{ id: 'soft-match-id', date_start: '2026-05-11' }]))

    const { findIngestedSaleMatch } = await import('@/lib/ingestion/dedupe')
    const result = await findIngestedSaleMatch('https://private.example/source', processedBase())

    expect(result).toEqual({ id: 'soft-match-id', matchType: 'soft_address_date' })
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
    const result = await findIngestedSaleMatch('https://private.example/source', processedBase())

    expect(result).toBeNull()
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
      { sourcePlatform: 'manual_upload' }
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

    accumulateDedupeDecisionAggregate(agg, { id: '1', matchType: 'source_url' })
    accumulateDedupeDecisionAggregate(agg, { id: '2', matchType: 'address_date' })
    accumulateDedupeDecisionAggregate(agg, { id: '3', matchType: 'soft_address_date' })
    accumulateDedupeDecisionAggregate(agg, null)

    expect(agg).toEqual({
      source_url: 1,
      exact_address_date: 1,
      soft_date_window: 1,
      no_match: 1,
      duplicateDecisionTrue: 1,
      duplicateDecisionFalse: 3,
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
      'source_url',
    ])
  })
})

