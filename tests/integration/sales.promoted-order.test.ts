import { describe, it, expect, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

const mockSales = [
  { id: 'A', title: 'Normal', lat: 38.25, lng: -85.75, date_start: '2025-01-10', time_start: '09:00', is_promoted: false },
  { id: 'B', title: 'Promoted', lat: 38.251, lng: -85.751, date_start: '2025-01-10', time_start: '09:00', is_promoted: true, promoted_until: new Date(Date.now() + 3600*1000).toISOString() }
]

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({ gte: () => ({ lte: () => ({ order: () => ({ range: () => Promise.resolve({ data: mockSales, error: null }) }) }) }) })
      })
    })
  })
}))

let GET: any
beforeAll(async () => {
  const route = await import('@/app/api/sales/route')
  GET = route.GET
})

describe('Sales API - promoted ordering', () => {
  it('returns promoted sale first when active', async () => {
    const req = new NextRequest('http://localhost:3000/api/sales?north=39&south=38&east=-85&west=-86')
    const res = await GET(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data?.[0]?.id).toBe('B')
  })
})


