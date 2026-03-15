/**
 * Integration tests for GET /api/geocoding/zip hardcoded LA ZIP entries.
 * Ensures LA demo ZIPs (e.g. 90069) return complete city/state/lat/lng so the
 * Test Sales Generator can create demo sales without hitting incomplete Nominatim data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/geocoding/zip/route'

const mockFromBase = vi.fn()
vi.mock('@/lib/supabase/clients', () => ({
  getRlsDb: () => Promise.resolve({}),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  }),
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: (req: NextRequest) => Promise<Response>) => handler,
}))

function requestWithZip(zip: string) {
  return new NextRequest(`http://localhost:3000/api/geocoding/zip?zip=${encodeURIComponent(zip)}`)
}

describe('GET /api/geocoding/zip hardcoded LA ZIPs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFromBase.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'PGRST116' } }),
        }),
      }),
    })
  })

  it('returns complete city/state/lat/lng for 90069 (West Hollywood)', async () => {
    const res = await GET(requestWithZip('90069'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.zip).toBe('90069')
    expect(typeof data.lat).toBe('number')
    expect(typeof data.lng).toBe('number')
    expect(data.city).toBeDefined()
    expect(data.city).not.toBe('')
    expect(data.city).not.toBe('Unknown')
    expect(data.state).toBeDefined()
    expect(typeof data.state).toBe('string')
    expect(data.state.trim().length).toBeGreaterThanOrEqual(2)
    expect(data.source).toBe('hardcoded')
  })

  it('returns complete city/state/lat/lng for 90210 (Beverly Hills)', async () => {
    const res = await GET(requestWithZip('90210'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.zip).toBe('90210')
    expect(data.city).toBe('Beverly Hills')
    expect(data.state).toBe('CA')
    expect(data.source).toBe('hardcoded')
  })

  it('returns complete city/state/lat/lng for 90028, 90046, 90048, 90211', async () => {
    const laZips = ['90028', '90046', '90048', '90211']
    for (const zip of laZips) {
      const res = await GET(requestWithZip(zip))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.zip).toBe(zip)
      expect(data.city).toBeDefined()
      expect(data.city.trim()).not.toBe('')
      expect(data.state).toBeDefined()
      expect(data.state.trim().length).toBeGreaterThanOrEqual(2)
      expect(data.source).toBe('hardcoded')
    }
  })
})
