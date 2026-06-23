import { describe, expect, it } from 'vitest'

import { classifyMissingValidReconciliation } from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliation'
import { buildActionableMissingValidAggregateFromTraces } from '@/lib/ingestion/ystmCoverage/buildActionableMissingValidAggregate'
import { isActionableReconciliationClass } from '@/lib/ingestion/ystmCoverage/classifyMissingValidReconciliationTypes'
import type {
  FalseExclusionTraceEvidence,
  FalseExclusionUrlTrace,
} from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import { isLinkedSaleVisibilityFiltered } from '@/lib/ingestion/ystmCoverage/linkedSaleVisibilityFilter'
import { MISSING_INGEST_TERMINAL_FAILURE_REASON } from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedRecoveryConfig'

const NOW_MS = Date.parse('2026-06-18T12:00:00.000Z')

function minimalTraceEvidence(
  overrides: Partial<FalseExclusionTraceEvidence> = {}
): FalseExclusionTraceEvidence {
  return {
    hasIngestedRow: false,
    ingestedStatus: null,
    ingestedPublishedSaleId: null,
    isDuplicate: false,
    addressStatus: null,
    configEnabled: null,
    configHasSourcePages: null,
    configCrawlExcluded: null,
    configLastCrawlAt: null,
    missingIngestionOutcome: null,
    missingIngestionFailureReason: null,
    visibleInPublishedIndex: false,
    catalogRepairEligible: false,
    sourceListingId: null,
    saleInstanceKey: null,
    ...overrides,
  }
}

function minimalTrace(
  partial: Pick<FalseExclusionUrlTrace, 'canonicalUrl' | 'primaryBucket'> &
    Partial<Omit<FalseExclusionUrlTrace, 'canonicalUrl' | 'primaryBucket'>>
): FalseExclusionUrlTrace {
  return {
    state: null,
    city: null,
    configKey: null,
    secondaryTags: [],
    summary: 'test trace',
    tracedAt: '2026-06-18T12:00:00.000Z',
    evidence: minimalTraceEvidence(),
    ...partial,
  }
}

describe('isLinkedSaleVisibilityFiltered', () => {
  it('flags archived linked sales', () => {
    expect(
      isLinkedSaleVisibilityFiltered(
        { status: 'archived', archived_at: '2026-01-01T00:00:00.000Z', ends_at: null, moderation_status: null },
        NOW_MS
      )
    ).toBe(true)
  })

  it('flags expired ends_at', () => {
    expect(
      isLinkedSaleVisibilityFiltered(
        {
          status: 'published',
          archived_at: null,
          ends_at: '2026-06-17T00:00:00.000Z',
          moderation_status: null,
        },
        NOW_MS
      )
    ).toBe(true)
  })
})

describe('classifyMissingValidReconciliation', () => {
  const base = {
    secondaryTags: [] as string[],
    ingested: null,
    observation: {
      missing_ingestion_outcome: null,
      missing_ingestion_failure_reason: null,
      missing_ingestion_replay_count: 0,
    },
    linkedSale: null,
    wouldPublishShadow: false,
    visibleInPublishedIndex: false,
    nowMs: NOW_MS,
  }

  it('classifies terminal address disposition as TRUE_TERMINAL', () => {
    expect(
      classifyMissingValidReconciliation({
        ...base,
        primaryBucket: 'terminal_disposition',
        ingested: {
          address_status: 'address_terminal_active',
          status: 'needs_check',
          published_sale_id: null,
          is_duplicate: false,
          failure_reasons: [],
        },
      })
    ).toBe('TRUE_TERMINAL')
  })

  it('classifies missing_ingest_terminal as non-actionable', () => {
    expect(
      classifyMissingValidReconciliation({
        ...base,
        primaryBucket: 'detail_first_fallback',
        secondaryTags: ['missing_ingest_terminal'],
        observation: {
          missing_ingestion_outcome: 'terminal',
          missing_ingestion_failure_reason: MISSING_INGEST_TERMINAL_FAILURE_REASON,
          missing_ingestion_replay_count: 3,
        },
      })
    ).toBe('MISSING_INGEST_TERMINAL')
  })

  it('classifies visibility-filter published_not_visible with archived linked sale', () => {
    expect(
      classifyMissingValidReconciliation({
        ...base,
        primaryBucket: 'published_not_visible',
        ingested: {
          address_status: 'address_available',
          status: 'published',
          published_sale_id: 'sale-1',
          is_duplicate: false,
          failure_reasons: [],
        },
        linkedSale: {
          status: 'archived',
          archived_at: '2026-01-01T00:00:00.000Z',
          ends_at: null,
          moderation_status: null,
        },
      })
    ).toBe('VISIBILITY_FILTER')
  })

  it('classifies stale observation when visible in published index', () => {
    expect(
      classifyMissingValidReconciliation({
        ...base,
        primaryBucket: 'crawl_not_yet_rotated',
        visibleInPublishedIndex: true,
        secondaryTags: ['observation_stale'],
      })
    ).toBe('STALE_OBSERVATION')
  })

  it('classifies duplicate suppressed as non-actionable', () => {
    expect(
      classifyMissingValidReconciliation({
        ...base,
        primaryBucket: 'url_duplicate_suppressed',
      })
    ).toBe('DUPLICATE_SUPPRESSED')
  })

  it('classifies recoverable repair_pending as RECOVERABLE', () => {
    expect(
      classifyMissingValidReconciliation({
        ...base,
        primaryBucket: 'repair_pending',
        ingested: {
          address_status: 'address_available',
          status: 'ready',
          published_sale_id: null,
          is_duplicate: false,
          failure_reasons: [],
        },
      })
    ).toBe('RECOVERABLE')
  })

  it('classifies schedule_wait as non-actionable SCHEDULE_WAIT', () => {
    const reconciliationClass = classifyMissingValidReconciliation({
      ...base,
      primaryBucket: 'schedule_wait',
      ingested: {
        address_status: 'address_gated',
        status: 'needs_check',
        published_sale_id: null,
        is_duplicate: false,
        failure_reasons: [],
      },
    })
    expect(reconciliationClass).toBe('SCHEDULE_WAIT')
    expect(isActionableReconciliationClass(reconciliationClass)).toBe(false)
  })

  it('classifies gated_false_positive as actionable GATED_WAIT', () => {
    const reconciliationClass = classifyMissingValidReconciliation({
      ...base,
      primaryBucket: 'gated_false_positive',
      ingested: {
        address_status: 'address_gated',
        status: 'needs_check',
        published_sale_id: null,
        is_duplicate: false,
        failure_reasons: [],
      },
    })
    expect(reconciliationClass).toBe('GATED_WAIT')
    expect(isActionableReconciliationClass(reconciliationClass)).toBe(true)
  })

  it('classifies unknown with would_publish as actionable', () => {
    expect(
      classifyMissingValidReconciliation({
        ...base,
        primaryBucket: 'unknown',
        wouldPublishShadow: true,
      })
    ).toBe('UNKNOWN_ACTIONABLE')
  })

  it('partition integrity: raw equals sum of all reconciliation classes', () => {
    const traces: FalseExclusionUrlTrace[] = [
      minimalTrace({
        canonicalUrl: 'https://example.com/a',
        primaryBucket: 'repair_pending',
      }),
      minimalTrace({
        canonicalUrl: 'https://example.com/b',
        primaryBucket: 'terminal_disposition',
      }),
      minimalTrace({
        canonicalUrl: 'https://example.com/c',
        primaryBucket: 'published_not_visible',
      }),
    ]
    const missingRows = traces.map((t) => ({
      canonical_url: t.canonicalUrl,
      missing_ingestion_outcome: null,
      missing_ingestion_failure_reason: null,
      missing_ingestion_replay_count: 0,
    }))
    const ingestedByUrl = new Map([
      [
        'https://example.com/a',
        {
          source_url: 'https://example.com/a',
          address_status: 'address_available',
          status: 'ready',
          published_sale_id: null,
          is_duplicate: false,
          failure_reasons: [],
        },
      ],
      [
        'https://example.com/b',
        {
          source_url: 'https://example.com/b',
          address_status: 'address_terminal_active',
          status: 'needs_check',
          published_sale_id: null,
          is_duplicate: false,
          failure_reasons: [],
        },
      ],
      [
        'https://example.com/c',
        {
          source_url: 'https://example.com/c',
          address_status: 'address_available',
          status: 'published',
          published_sale_id: 'sale-c',
          is_duplicate: false,
          failure_reasons: [],
        },
      ],
    ])
    const linkedSalesById = new Map([
      [
        'sale-c',
        {
          id: 'sale-c',
          status: 'archived',
          archived_at: '2026-01-01T00:00:00.000Z',
          ends_at: null,
          moderation_status: null,
        },
      ],
    ])
    const agg = buildActionableMissingValidAggregateFromTraces({
      traces,
      missingRows,
      ingestedByUrl,
      linkedSalesById,
      wouldPublishUrls: new Set(),
      visibleCanonicalUrls: new Set(),
      nowMs: NOW_MS,
    })
    const classSum = Object.values(agg.byReconciliationClass).reduce((a, b) => a + b, 0)
    expect(classSum).toBe(agg.rawMissingValidYstmUrls)
    const actionableSum = Object.entries(agg.byReconciliationClass)
      .filter(([cls]) => isActionableReconciliationClass(cls as never))
      .reduce((a, [, n]) => a + n, 0)
    expect(actionableSum).toBe(agg.effectiveMissingValidYstmUrls)
  })
})
