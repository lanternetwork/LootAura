import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyCrawlSkipTaxonomyRollup } from '@/lib/admin/crawlSkipTaxonomyMetrics'
import { buildYstmFalseExclusionSaleIdentityDashboard } from '@/lib/admin/ystmFalseExclusionSaleIdentityDashboard'
import type { SaleInstanceShadowReplayReport } from '@/lib/ingestion/ystmCoverage/saleInstanceShadowReplayTypes'

const mockFromBase = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

function emptyListChain() {
  return {
    select: vi.fn(() => ({
      gte: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          range: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    })),
  }
}

function shadowReplayChain(rows: unknown[]) {
  return {
    select: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
}

function softDedupeCountChain(count: number) {
  return {
    select: vi.fn(() => ({
      gte: vi.fn().mockResolvedValue({ count, error: null }),
    })),
  }
}

function coverageObservationsChain(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({
          range: vi.fn().mockResolvedValue({ data: rows, error: null }),
        })),
      })),
    })),
  }
}

function salesChain(rows: unknown[]) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of ['eq', 'is', 'or']) {
    q[m] = vi.fn(() => q)
  }
  q.range = vi.fn().mockResolvedValue({ data: rows, error: null })
  return {
    select: vi.fn(() => q),
  }
}

function ingestedSalesChain(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      in: vi.fn().mockResolvedValue({ data: rows, error: null }),
    })),
  }
}

const shadowReplayBase: SaleInstanceShadowReplayReport = {
  generatedAt: '2026-05-22T00:00:00Z',
  replayedCount: 7,
  oldSuppressCount: 4,
  newSuppressCount: 1,
  wouldPublishCount: 3,
  divergenceOldSuppressNewPublishCount: 0,
  ambiguousCount: 0,
  sampleDivergences: [],
}

beforeEach(() => {
  mockFromBase.mockImplementation((_admin, table: string) => {
    switch (table) {
      case 'ingestion_orchestration_runs':
        return emptyListChain()
      case 'ystm_sale_instance_shadow_replays':
        return shadowReplayChain([])
      case 'ingested_sale_soft_dedupe_suppressions':
        return softDedupeCountChain(0)
      case 'ystm_coverage_observations':
        return coverageObservationsChain([])
      case 'sales':
        return salesChain([])
      case 'ingested_sales':
        return ingestedSalesChain([])
      default:
        throw new Error(`unexpected table ${table}`)
    }
  })
})

describe('buildYstmFalseExclusionSaleIdentityDashboard', () => {
  it('passes through scoreboard inputs and defaults DB-backed metrics to zero', async () => {
    const dash = await buildYstmFalseExclusionSaleIdentityDashboard(
      {} as never,
      {
        missingValidYstmUrls: 12,
        missingNeverAttempted: 4,
        saleInstanceIdentity: {
          ystmRowsWithKey: 10,
          ystmActiveRowsWithKey: 8,
          keyCollisionGroups: 1,
          sampleCollisionKeys: ['k1'],
        },
        saleInstanceShadowReplay: shadowReplayBase,
      },
      new Date('2026-05-22T12:00:00Z')
    )

    expect(dash.missingValidYstmUrls).toBe(12)
    expect(dash.missingNeverAttempted).toBe(4)
    expect(dash.saleInstanceKeyCollisions).toBe(1)
    expect(dash.urlReuseDetected).toBe(0)
    expect(dash.softDedupeSuppressed).toBe(0)
    expect(dash.coverageWithoutMatchMethod).toBe(0)
    expect(dash.crawlSkipTaxonomy24h).toEqual(emptyCrawlSkipTaxonomyRollup())
    expect(dash.healthy).toBe(true)
    expect(dash.alerts).toEqual([])
  })

  it('counts shadow classifier outcomes and raises divergence alert', async () => {
    mockFromBase.mockImplementation((_admin, table: string) => {
      if (table === 'ystm_sale_instance_shadow_replays') {
        return shadowReplayChain([
          { new_decision: 'new_event_same_url', divergence_kind: null, old_skip_sub_reason: null },
          { new_decision: 'same_event_updated', divergence_kind: null, old_skip_sub_reason: null },
          {
            new_decision: 'ambiguous_requires_review',
            divergence_kind: null,
            old_skip_sub_reason: null,
          },
        ])
      }
      if (table === 'ingestion_orchestration_runs') return emptyListChain()
      if (table === 'ingested_sale_soft_dedupe_suppressions') return softDedupeCountChain(2)
      if (table === 'ystm_coverage_observations') return coverageObservationsChain([])
      if (table === 'sales') return salesChain([])
      if (table === 'ingested_sales') return ingestedSalesChain([])
      throw new Error(`unexpected table ${table}`)
    })

    const dash = await buildYstmFalseExclusionSaleIdentityDashboard(
      {} as never,
      {
        missingValidYstmUrls: 3,
        missingNeverAttempted: 1,
        saleInstanceIdentity: {
          ystmRowsWithKey: 0,
          ystmActiveRowsWithKey: 0,
          keyCollisionGroups: 0,
          sampleCollisionKeys: [],
        },
        saleInstanceShadowReplay: {
          ...shadowReplayBase,
          divergenceOldSuppressNewPublishCount: 2,
        },
      }
    )

    expect(dash.newEventSameUrl).toBe(1)
    expect(dash.sameEventUpdated).toBe(1)
    expect(dash.ambiguousRequiresReview).toBe(1)
    expect(dash.urlReuseDetected).toBe(1)
    expect(dash.softDedupeSuppressed).toBe(2)
    expect(dash.alerts.some((a) => a.code === 'shadow_old_suppress_new_publish')).toBe(true)
    expect(dash.healthy).toBe(false)
  })
})
