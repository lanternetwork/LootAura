import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Use the stable Supabase server mock from tests/setup.ts by default,
// but override per-test to control favorites + sales rows.

describe('GET /api/favorites visibility', () => {
  let GET: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.resetModules()

    // Freshly import the route after resetting modules so it picks up our mocks
    const route = await import('@/app/api/favorites/route')
    GET = route.GET
  })

  it('excludes archived/ended/hidden favorites and keeps count in sync', async () => {
    const mockUser = { id: 'user-1' }

    const endedPastSale = {
      id: 'sale-ended-past',
      status: 'published',
      archived_at: null,
      moderation_status: null,
      date_start: '2024-11-22',
      time_start: '09:00',
      date_end: '2024-11-23',
      time_end: '17:00',
      // minimal required fields for Sale type
      title: 'Past Sale',
      description: null,
      address: null,
      city: 'Test City',
      state: 'TS',
      zip_code: '00000',
      lat: 38.0,
      lng: -85.0,
      price: null,
      tags: [],
      cover_image_url: null,
      images: null,
      privacy_mode: 'exact',
      is_featured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const activeFutureSale = {
      ...endedPastSale,
      id: 'sale-active-future',
      title: 'Future Sale',
      date_start: '2099-01-01',
      date_end: '2099-01-02',
    }

    // Override the Supabase server client for this test only
    const mockFrom = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { sale_id: endedPastSale.id, sales_v2: endedPastSale },
          { sale_id: activeFutureSale.id, sales_v2: activeFutureSale },
        ],
        error: null,
      }),
    }))

    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: () => ({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
        from: mockFrom,
      }),
    }))

    const req = new NextRequest('http://localhost/api/favorites', { method: 'GET' })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)

    // Only the future/active sale should survive visibility filtering
    expect(body.sales).toEqual([expect.objectContaining({ id: activeFutureSale.id })])
    expect(body.count).toBe(1)
  })
})


