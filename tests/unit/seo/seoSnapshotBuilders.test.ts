import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluateSeoEnablementMetricGateFromSnapshotFields } from '@/lib/seo/evaluateSeoEnablementGate'
import { buildSeoEnablementSnapshot } from '@/lib/seo/snapshots/buildSeoEnablementSnapshot'
import { buildSeoQualifiedMetrosSnapshot } from '@/lib/seo/snapshots/buildSeoQualifiedMetrosSnapshot'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'

const aggregateMock = vi.fn()
const publishedIndexMock = vi.fn()
const duplicateMock = vi.fn()
const listMissingMock = vi.fn()
const traceMock = vi.fn()
const actionableMock = vi.fn()
const fetchNationwideMock = vi.fn()

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore', () => ({
  aggregateYstmCoverageObservations: (...args: unknown[]) => aggregateMock(...args),
}))

vi.mock('@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex', () => ({
  loadLootAuraPublishedYstmIndex: (...args: unknown[]) => publishedIndexMock(...args),
}))

vi.mock('@/lib/admin/duplicateCanonicalPublishClusters', () => ({
  countDuplicatePublishedCanonicalClusters: (...args: unknown[]) => duplicateMock(...args),
}))

vi.mock('@/lib/ingestion/ystmCoverage/buildFalseExclusionAuditReport', () => ({
  listMissingValidObservations: (...args: unknown[]) => listMissingMock(...args),
  traceMissingValidFalseExclusions: (...args: unknown[]) => traceMock(...args),
}))

vi.mock('@/lib/ingestion/ystmCoverage/buildActionableMissingValidAggregate', () => ({
  buildActionableMissingValidAggregate: (...args: unknown[]) => actionableMock(...args),
}))

vi.mock('@/lib/seo/fetchAllSeoMetroInventory', () => ({
  fetchNationwideSeoMetroInventory: (...args: unknown[]) => fetchNationwideMock(...args),
}))

describe('seo snapshot builders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aggregateMock.mockResolvedValue({
      validActiveYstmUrls: 3000,
      publishedVisibleInAudit: 2958,
    })
    publishedIndexMock.mockResolvedValue({
      visibleCanonicalUrls: new Set(['https://example.com/a']),
      publishedActiveTotal: 2581,
    })
    duplicateMock.mockResolvedValue(0)
    listMissingMock.mockResolvedValue([])
    traceMock.mockResolvedValue({ traces: [] })
    actionableMock.mockResolvedValue({ effectiveMissingValidYstmUrls: 36 })
    fetchNationwideMock.mockResolvedValue({
      metros: [
        {
          slug: 'dallas-tx',
          city: 'Dallas',
          state: 'TX',
          timezone: 'America/Chicago',
          minActiveListings: 25,
        },
      ],
      inventoryBySlug: {
        'dallas-tx': {
          activeListingCount: 50,
          crawlableInventoryPct: 0.95,
          lastUpdatedAt: '2026-06-01T00:00:00.000Z',
        },
      },
    })
  })

  it('buildSeoEnablementSnapshot computes metric gate without scoreboard', async () => {
    const result = await buildSeoEnablementSnapshot()
    expect(result.seoGatePassed).toBe(true)
    expect(result.publishedActiveInventory).toBe(2581)
    expect(result.duplicateCanonicalClusters).toBe(0)
    expect(aggregateMock).toHaveBeenCalled()
    expect(duplicateMock).toHaveBeenCalled()
    expect(traceMock).toHaveBeenCalled()
  })

  it('buildSeoQualifiedMetrosSnapshot marks qualified metros from inventory', async () => {
    const rows = await buildSeoQualifiedMetrosSnapshot()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.slug).toBe('dallas-tx')
    expect(rows[0]?.qualified).toBe(true)
    expect(rows[0]?.listing_count).toBe(50)
    expect(rows[0]?.city).toBe('Dallas')
    expect(rows[0]?.state).toBe('TX')
    expect(rows[0]?.timezone).toBe('America/Chicago')
  })
})

describe('resolveSeoSitemapPlan split gates', () => {
  it('includes listing chunks only when seoEmissionAllowed', () => {
    const plan = resolveSeoSitemapPlan(2500, {
      seoEmissionAllowed: true,
      indexingAllowed: false,
    })
    expect(plan.listingChunkCount).toBe(3)
    expect(plan.segmentIds).not.toContain('cities')
    expect(plan.segmentIds).not.toContain('weekends')
  })

  it('includes geo segments only when indexingAllowed', () => {
    const plan = resolveSeoSitemapPlan(2500, {
      seoEmissionAllowed: false,
      indexingAllowed: true,
    })
    expect(plan.listingChunkCount).toBe(0)
    expect(plan.segmentIds).toEqual(['static', 'cities', 'weekends'])
  })
})

describe('evaluateSeoEnablementMetricGateFromSnapshotFields', () => {
  it('passes with healthy snapshot metrics', () => {
    const metric = evaluateSeoEnablementMetricGateFromSnapshotFields({
      coveragePct: 98.6,
      effectiveMissingValid: 36,
      duplicateCanonicalClusters: 0,
      publishedActiveInventory: 2581,
    })
    expect(metric.metricGatePass).toBe(true)
  })
})
