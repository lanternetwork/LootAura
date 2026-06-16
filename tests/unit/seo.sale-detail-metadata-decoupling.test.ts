import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockBuildIngestionMetricsResponse = vi.hoisted(() => vi.fn())
const mockBuildYstmCoverageScoreboard = vi.hoisted(() => vi.fn())
const mockFetchNationwideSeoMetroInventory = vi.hoisted(() => vi.fn())
const mockGetSaleWithItems = vi.hoisted(() => vi.fn())
const mockCreateSupabaseServerClient = vi.hoisted(() => vi.fn())
const mockGetSeoRolloutStateForRequest = vi.hoisted(() => vi.fn())

vi.mock('@/app/api/admin/ingestion/metrics/route', () => ({
  buildIngestionMetricsResponse: (...args: unknown[]) => mockBuildIngestionMetricsResponse(...args),
}))

vi.mock('@/lib/admin/ystmCoverageScoreboard', () => ({
  buildYstmCoverageScoreboard: (...args: unknown[]) => mockBuildYstmCoverageScoreboard(...args),
}))

vi.mock('@/lib/seo/fetchAllSeoMetroInventory', () => ({
  fetchNationwideSeoMetroInventory: (...args: unknown[]) => mockFetchNationwideSeoMetroInventory(...args),
}))

vi.mock('@/lib/data/salesAccess', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data/salesAccess')>('@/lib/data/salesAccess')
  return {
    ...actual,
    getSaleWithItems: (...args: unknown[]) => mockGetSaleWithItems(...args),
  }
})

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
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildIngestionMetricsResponse.mockResolvedValue({ ok: true })
    mockBuildYstmCoverageScoreboard.mockResolvedValue({})
    mockFetchNationwideSeoMetroInventory.mockResolvedValue({ metros: [], inventoryBySlug: {} })
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

    mockGetSaleWithItems.mockResolvedValue({
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
      },
      items: [],
    })
  })

  it('does not execute admin telemetry dependencies during sale metadata generation', async () => {
    const page = await import('@/app/sales/[id]/page')
    const metadata = await page.generateMetadata({ params: Promise.resolve({ id: 'sale-1' }) })

    expect(metadata).toBeDefined()
    expect(mockGetSeoRolloutStateForRequest).toHaveBeenCalledTimes(1)
    expect(mockBuildIngestionMetricsResponse).not.toHaveBeenCalled()
    expect(mockBuildYstmCoverageScoreboard).not.toHaveBeenCalled()
    expect(mockFetchNationwideSeoMetroInventory).not.toHaveBeenCalled()
  })
})
