import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import zipcodes from 'zipcodes'

const require = createRequire(import.meta.url)
const tzlookup = require('../../lib/vendor/tz-lookup/tz.cjs') as (lat: number, lng: number) => string

const hoisted = vi.hoisted(() => ({
  zipMaybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: hoisted.zipMaybeSingle,
      }),
    }),
  })),
}))

describe('resolveIanaTimezoneForIngestionZip5', () => {
  beforeEach(() => {
    hoisted.zipMaybeSingle.mockReset()
  })

  it('fixture ZIP 46319 resolves to a valid IANA zone via zipcodes npm + tz-lookup', () => {
    const rec = zipcodes.lookup('46319') as { latitude: number; longitude: number } | null
    expect(rec).toBeTruthy()
    const zone = tzlookup(rec!.latitude, rec!.longitude) as string
    expect(typeof zone).toBe('string')
    expect(zone.length).toBeGreaterThan(3)
  })

  it('prefers lootaura_v2.zipcodes coordinates when present', async () => {
    hoisted.zipMaybeSingle.mockResolvedValueOnce({
      data: { lat: 41.5287, lng: -87.4237, state: 'IN' },
      error: null,
    })
    const { resolveIanaTimezoneForIngestionZip5 } = await import(
      '@/lib/ingestion/resolveIanaTimezoneForIngestionZip5'
    )
    const admin = {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>
    const r = await resolveIanaTimezoneForIngestionZip5(admin, { zip5: '46319', expectedState: 'IN' })
    expect(r?.coordinateSource).toBe('zipcodes_database')
    expect(r?.iana).toMatch(/^America\//)
  })

  it('falls back to zipcodes npm when DB row is missing', async () => {
    hoisted.zipMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const { resolveIanaTimezoneForIngestionZip5 } = await import(
      '@/lib/ingestion/resolveIanaTimezoneForIngestionZip5'
    )
    const admin = {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>
    const r = await resolveIanaTimezoneForIngestionZip5(admin, { zip5: '46319', expectedState: 'IN' })
    expect(r?.coordinateSource).toBe('zipcodes_npm_package')
    expect(r?.iana).toMatch(/^America\//)
  })
})
