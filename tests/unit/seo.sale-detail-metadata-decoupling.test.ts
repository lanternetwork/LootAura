import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockBuildIngestionMetricsResponse = vi.hoisted(() => vi.fn())
const mockBuildYstmCoverageScoreboard = vi.hoisted(() => vi.fn())
const mockFetchNationwideSeoMetroInventory = vi.hoisted(() => vi.fn())
const mockGetInventorySeoEmissionForRequest = vi.hoisted(() => vi.fn())
const mockGetSaleWithItemsForRequest = vi.hoisted(() => vi.fn())
const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn())
const mockGetSeoRolloutStateForRequest = vi.hoisted(() => vi.fn())

const saleDetailPageSourcePath = path.join(process.cwd(), 'app/sales/[id]/page.tsx')

vi.mock('@/app/api/admin/ingestion/metrics/route', () => ({
  buildIngestionMetricsResponse: (...args: unknown[]) => mockBuildIngestionMetricsResponse(...args),
}))

vi.mock('@/lib/admin/ystmCoverageScoreboard', () => ({
  buildYstmCoverageScoreboard: (...args: unknown[]) => mockBuildYstmCoverageScoreboard(...args),
}))

vi.mock('@/lib/seo/fetchAllSeoMetroInventory', () => ({
  fetchNationwideSeoMetroInventory: (...args: unknown[]) => mockFetchNationwideSeoMetroInventory(...args),
}))

vi.mock('@/lib/seo/resolveInventorySeoEmission', () => ({
  getInventorySeoEmissionForRequest: (...args: unknown[]) => mockGetInventorySeoEmissionForRequest(...args),
}))

vi.mock('@/lib/data/saleDetailLoader', () => ({
  getSaleWithItemsForRequest: (...args: unknown[]) => mockGetSaleWithItemsForRequest(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) => mockCreateSupabaseServerClient(...args),
}))

vi.mock('@/lib/seo/loadSeoRolloutState', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo/loadSeoRolloutState')>('@/lib/seo/loadSeoRolloutState')
  return {
    ...actual,
    getSeoRolloutStateForRequest: (...args: unknown[]) => mockGetSeoRolloutStateForRequest(...args),
    getSeoMetrosForRequest: vi.fn().mockResolvedValue([]),
  }
})

describe('sale detail metadata decoupling', () => {
  function setupSale(overrides: Record<string, unknown> = {}) {
    mockGetSaleWithItemsForRequest.mockResolvedValue({
      sale: {
        id: 'sale-1',
        owner_id: 'owner-1',
        title: 'Test Sale',
        city: 'Louisville',
        state: 'KY',
        date_start: '2026-06-01',
        time_start: '09:00',
        status: 'published',
        privacy_mode: 'exact',
        is_featured: false,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
        moderation_status: 'approved',
        archived_at: null,
        ...overrides,
      },
      items: [],
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildIngestionMetricsResponse.mockResolvedValue({ ok: true })
    mockBuildYstmCoverageScoreboard.mockResolvedValue({})
    mockFetchNationwideSeoMetroInventory.mockResolvedValue({ metros: [], inventoryBySlug: {} })
    mockGetInventorySeoEmissionForRequest.mockResolvedValue({
      indexingAllowed: false,
      metricsAvailable: true,
      rollout: { indexingAllowed: false, blockers: [] },
    })
    mockGetSeoRolloutStateForRequest.mockResolvedValue({
      publicIndexingEnabled: false,
      publicIndexingEnabledAt: null,
      publicIndexingDisabledAt: null,
      crawlValidationPassed: false,
      crawlValidationPassedAt: null,
      searchConsoleValidationPassed: false,
      searchConsoleValidationPassedAt: null,
    })

    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    })

    setupSale()
  })

  it('does not execute admin telemetry dependencies during sale metadata generation', async () => {
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })

    expect(metadata).toBeDefined()
    expect(mockGetSeoRolloutStateForRequest).toHaveBeenCalledTimes(1)
    expect(mockGetInventorySeoEmissionForRequest).not.toHaveBeenCalled()
    expect(mockBuildIngestionMetricsResponse).not.toHaveBeenCalled()
    expect(mockBuildYstmCoverageScoreboard).not.toHaveBeenCalled()
    expect(mockFetchNationwideSeoMetroInventory).not.toHaveBeenCalled()
  })

  it('keeps inventory emission and admin telemetry out of sale detail page source', () => {
    const source = readFileSync(saleDetailPageSourcePath, 'utf8')
    expect(source).not.toContain('getInventorySeoEmissionForRequest')
    expect(source).not.toContain('buildIngestionMetricsResponse')
    expect(source).not.toContain('buildYstmCoverageScoreboard')
    expect(source).not.toContain('fetchNationwideSeoMetroInventory')
    expect(source).toContain('getSeoRolloutStateForRequest')
    expect(source).toContain('isSeoIndexRolloutReady')
  })

  it('returns noindex when rollout state is unavailable', async () => {
    mockGetSeoRolloutStateForRequest.mockRejectedValueOnce(new Error('rollout unavailable'))
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
  })

  it('returns noindex when rollout is disabled or not ready', async () => {
    mockGetSeoRolloutStateForRequest.mockResolvedValueOnce({
      publicIndexingEnabled: false,
      publicIndexingEnabledAt: null,
      publicIndexingDisabledAt: null,
      crawlValidationPassed: true,
      crawlValidationPassedAt: '2026-06-01T00:00:00Z',
      searchConsoleValidationPassed: true,
      searchConsoleValidationPassedAt: '2026-06-01T00:00:00Z',
    })
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
  })

  it('can return index when rollout is ready and sale is locally eligible', async () => {
    mockGetSeoRolloutStateForRequest.mockResolvedValueOnce({
      publicIndexingEnabled: true,
      publicIndexingEnabledAt: '2026-06-01T00:00:00Z',
      publicIndexingDisabledAt: null,
      crawlValidationPassed: true,
      crawlValidationPassedAt: '2026-06-01T00:00:00Z',
      searchConsoleValidationPassed: true,
      searchConsoleValidationPassedAt: '2026-06-01T00:00:00Z',
    })
    setupSale({ status: 'published', moderation_status: 'approved', archived_at: null })
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: true, follow: true })
  })

  it('returns noindex when sale is locally ineligible', async () => {
    mockGetSeoRolloutStateForRequest.mockResolvedValueOnce({
      publicIndexingEnabled: true,
      publicIndexingEnabledAt: '2026-06-01T00:00:00Z',
      publicIndexingDisabledAt: null,
      crawlValidationPassed: true,
      crawlValidationPassedAt: '2026-06-01T00:00:00Z',
      searchConsoleValidationPassed: true,
      searchConsoleValidationPassedAt: '2026-06-01T00:00:00Z',
    })
    setupSale({ status: 'draft' })
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
  })
})
