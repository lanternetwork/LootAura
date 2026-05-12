import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolvePersistableSaleEndsAt } from '@/lib/sales/resolvePersistableSaleEndsAt'
import * as ResolveTz from '@/lib/sales/resolveListingTimezone'
import { logger } from '@/lib/log'

vi.mock('@/lib/sales/resolveListingTimezone', () => ({
  resolveListingTimezoneForSale: vi.fn(),
}))

const mockResolveTz = vi.mocked(ResolveTz.resolveListingTimezoneForSale)

describe('resolvePersistableSaleEndsAt', () => {
  const admin = {} as ReturnType<typeof import('@/lib/supabase/clients').getAdminDb>
  const baseDates = {
    date_start: '2026-06-15',
    time_start: '09:00:00',
    date_end: null as string | null,
    time_end: '12:00:00' as string | null,
    zip_code: '60601',
    state: 'IL',
    lat: 41.8,
    lng: -87.6,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns nulls when timezone resolution fails', async () => {
    mockResolveTz.mockResolvedValue({ ok: false, reason: 'no_timezone_candidates' })
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    const out = await resolvePersistableSaleEndsAt(admin, baseDates, { operation: 'test' })

    expect(out).toEqual({ ends_at: null, listing_timezone: null })
    expect(warnSpy).toHaveBeenCalledWith(
      'sale_listing_window: timezone unresolved (ends_at skipped)',
      expect.objectContaining({ reason: 'no_timezone_candidates' })
    )
    warnSpy.mockRestore()
  })

  it('persists listing_timezone but null ends_at when wall clock is unresolvable', async () => {
    mockResolveTz.mockResolvedValue({ ok: true, iana: 'America/Chicago', source: 'zip5' })
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    const out = await resolvePersistableSaleEndsAt(
      admin,
      { ...baseDates, date_start: 'not-a-date' },
      { operation: 'test' }
    )

    expect(out.listing_timezone).toBe('America/Chicago')
    expect(out.ends_at).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      'sale_listing_window: ends_at computation failed',
      expect.objectContaining({ compute_reason: 'invalid_date' })
    )
    warnSpy.mockRestore()
  })

  it('returns ends_at and listing_timezone when resolution and compute succeed', async () => {
    mockResolveTz.mockResolvedValue({ ok: true, iana: 'America/Chicago', source: 'zip5' })
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})

    const out = await resolvePersistableSaleEndsAt(admin, baseDates, { operation: 'test' })

    expect(out.listing_timezone).toBe('America/Chicago')
    expect(out.ends_at).toBe('2026-06-15T17:00:00.000Z')
    expect(infoSpy).toHaveBeenCalledWith(
      'sale_listing_window: resolved ends_at',
      expect.objectContaining({ listing_timezone: 'America/Chicago' })
    )
    infoSpy.mockRestore()
  })
})
