import { describe, expect, it, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  upsertPayloads: [] as unknown[],
  resolveIana: vi.fn(),
}))

vi.mock('@/lib/ingestion/resolveIanaTimezoneForIngestionZip5', () => ({
  resolveIanaTimezoneForIngestionZip5: hoisted.resolveIana,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: vi.fn((_admin: unknown, table: string) => {
    if (table === 'ingestion_city_configs') {
      return {
        upsert: async (payload: unknown) => {
          hoisted.upsertPayloads.push(payload)
          return { error: null }
        },
      }
    }
    return {}
  }),
}))

import { ensureIngestionCityConfigForValidatedLocality } from '@/lib/ingestion/ensureIngestionCityConfigForValidatedLocality'

const SALE_PHP =
  'https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=218927'

describe('ensureIngestionCityConfigForValidatedLocality', () => {
  beforeEach(() => {
    hoisted.upsertPayloads = []
    hoisted.resolveIana.mockReset()
    hoisted.resolveIana.mockResolvedValue({
      iana: 'America/Chicago',
      coordinateSource: 'zipcodes_npm_package',
    })
  })

  it('upserts an enabled external_page_source row with empty source_pages for Griffith-style ZIP locality', async () => {
    const admin = {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>
    const r = await ensureIngestionCityConfigForValidatedLocality(admin, {
      sourcePlatform: 'external_page_source',
      sourceUrl: SALE_PHP,
      city: 'Griffith',
      stateCode: 'IN',
      resolvedAddressRaw: '1751 N Lafayette St 46319',
      rawPayload: {},
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.timezone).toBe('America/Chicago')
    expect(r.localityAuthoritySource).toBe('zip_locality_primary')
    expect(hoisted.upsertPayloads).toHaveLength(1)
    expect(hoisted.upsertPayloads[0]).toMatchObject({
      city: 'Griffith',
      state: 'IN',
      source_platform: 'external_page_source',
      enabled: true,
      timezone: 'America/Chicago',
      source_pages: [],
    })
  })

  it('does not provision when timezone resolution fails', async () => {
    hoisted.resolveIana.mockResolvedValueOnce(null)
    const admin = {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>
    const r = await ensureIngestionCityConfigForValidatedLocality(admin, {
      sourcePlatform: 'external_page_source',
      sourceUrl: SALE_PHP,
      city: 'Griffith',
      stateCode: 'IN',
      resolvedAddressRaw: '1751 N Lafayette St 46319',
      rawPayload: {},
    })
    expect(r).toEqual({ ok: false, reason: 'missing_timezone' })
    expect(hoisted.upsertPayloads).toHaveLength(0)
  })

  it('does not provision for untrusted locality', async () => {
    const admin = {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>
    const r = await ensureIngestionCityConfigForValidatedLocality(admin, {
      sourcePlatform: 'external_page_source',
      sourceUrl: SALE_PHP,
      city: 'Griffith',
      stateCode: 'IN',
      resolvedAddressRaw: 'not a concrete address',
      rawPayload: {},
    })
    expect(r.ok).toBe(false)
    expect(hoisted.upsertPayloads).toHaveLength(0)
  })

  it('rejects unsupported source platforms', async () => {
    const admin = {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>
    const r = await ensureIngestionCityConfigForValidatedLocality(admin, {
      sourcePlatform: 'manual_upload',
      sourceUrl: SALE_PHP,
      city: 'Griffith',
      stateCode: 'IN',
      resolvedAddressRaw: '1751 N Lafayette St 46319',
      rawPayload: {},
    })
    expect(r).toEqual({ ok: false, reason: 'unsupported_source_platform' })
  })

  it('is safe to call twice (idempotent upsert contract)', async () => {
    const admin = {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>
    const args = {
      sourcePlatform: 'external_page_source' as const,
      sourceUrl: SALE_PHP,
      city: 'Griffith',
      stateCode: 'IN',
      resolvedAddressRaw: '1751 N Lafayette St 46319',
      rawPayload: {},
    }
    await ensureIngestionCityConfigForValidatedLocality(admin, args)
    await ensureIngestionCityConfigForValidatedLocality(admin, args)
    expect(hoisted.upsertPayloads).toHaveLength(2)
    expect(hoisted.upsertPayloads[0]).toEqual(hoisted.upsertPayloads[1])
  })

  it('allows concurrent provision attempts without throwing', async () => {
    const admin = {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>
    const args = {
      sourcePlatform: 'external_page_source' as const,
      sourceUrl: SALE_PHP,
      city: 'Griffith',
      stateCode: 'IN',
      resolvedAddressRaw: '1751 N Lafayette St 46319',
      rawPayload: {},
    }
    const [a, b] = await Promise.all([
      ensureIngestionCityConfigForValidatedLocality(admin, args),
      ensureIngestionCityConfigForValidatedLocality(admin, args),
    ])
    expect(a.ok && b.ok).toBe(true)
    expect(hoisted.upsertPayloads).toHaveLength(2)
  })
})
