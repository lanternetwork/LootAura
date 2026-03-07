/**
 * Unit tests for /sales in-app fast path and non-in-app behavior.
 * (a) In-app + mobile uses fast path and skips SSR-heavy branches.
 * (b) Non-in-app /sales keeps current behavior (auth + center + SSR when applicable).
 * (c) Sale detail route is unaffected (no changes to [id] page).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getInAppUaToken } from '@/lib/runtime/isNativeApp'

const IN_APP_UA = `Mozilla/5.0 (Linux; Android 10) ${getInAppUaToken()} Chrome/91.0`
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0'

function createHeadersGet(overrides: Record<string, string | null> = {}) {
  return (key: string) => {
    if (key in overrides) return overrides[key] ?? null
    switch (key) {
      case 'host': return 'localhost'
      case 'x-forwarded-host': return null
      case 'x-forwarded-proto': return null
      case 'x-vercel-ip-latitude': return '38.0'
      case 'x-vercel-ip-longitude': return '-85.0'
      case 'x-vercel-ip-city': return null
      case 'x-vercel-ip-region': return null
      default: return null
    }
  }
}

const mockCreateSupabaseServerClient = vi.fn()
const mockComputeSSRInitialSales = vi.fn()

vi.mock('next/headers', () => ({
  headers: vi.fn(),
  cookies: vi.fn(() => ({
    get: vi.fn(() => ({ value: undefined })),
    set: vi.fn(),
    getAll: vi.fn(),
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) => mockCreateSupabaseServerClient(...args),
}))

vi.mock('@/lib/map/ssrInitialSales', () => ({
  computeSSRInitialSales: (...args: unknown[]) => mockComputeSSRInitialSales(...args),
}))

describe('Sales page fast path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSupabaseServerClient.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    mockComputeSSRInitialSales.mockResolvedValue({
      initialSales: [],
      initialBufferedBounds: null,
    })
  })

  it('(a) in-app + mobile uses fast path and skips SSR-heavy branches', async () => {
    const { headers } = await import('next/headers')
    vi.mocked(headers).mockResolvedValue({
      get: (key: string) =>
        key === 'user-agent' ? IN_APP_UA : createHeadersGet()(key),
    } as Headers)

    const SalesPage = (await import('@/app/sales/page')).default
    await SalesPage({ searchParams: {} })

    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled()
    expect(mockComputeSSRInitialSales).not.toHaveBeenCalled()
  })

  it('(b) non-in-app /sales keeps current behavior (auth + optional SSR)', async () => {
    const { headers } = await import('next/headers')
    vi.mocked(headers).mockResolvedValue({
      get: (key: string) =>
        key === 'user-agent' ? DESKTOP_UA : createHeadersGet()(key),
    } as Headers)

    const SalesPage = (await import('@/app/sales/page')).default
    await SalesPage({ searchParams: {} })

    expect(mockCreateSupabaseServerClient).toHaveBeenCalled()
    // With Vercel IP headers we get initialCenter, so computeSSRInitialSales is called
    expect(mockComputeSSRInitialSales).toHaveBeenCalled()
  })

  it('(c) sale detail route is unaffected', async () => {
    const saleDetailPage = await import('@/app/sales/[id]/page')
    expect(saleDetailPage.default).toBeDefined()
    expect(typeof saleDetailPage.default).toBe('function')
    expect(saleDetailPage.generateMetadata).toBeDefined()
  })
})
