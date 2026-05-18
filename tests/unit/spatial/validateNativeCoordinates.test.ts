import { describe, expect, it } from 'vitest'
import { validateNativeCoordinates } from '@/lib/ingestion/spatial/validateNativeCoordinates'

describe('validateNativeCoordinates', () => {
  const chicagoUrl =
    'https://yardsaletreasuremap.com/US/Illinois/Chicago/4443-S-St-Louis-Ave/38754131/userlisting.html'

  it('accepts plausible US coordinates for matching state', () => {
    expect(
      validateNativeCoordinates({
        lat: 41.812252,
        lng: -87.71115,
        state: 'IL',
        sourceUrl: chicagoUrl,
      })
    ).toEqual({ ok: true })
  })

  it('rejects null island', () => {
    expect(
      validateNativeCoordinates({ lat: 0, lng: 0, state: 'IL', sourceUrl: chicagoUrl })
    ).toEqual({ ok: false, reason: 'null_island' })
  })

  it('rejects state mismatch vs YSTM URL path', () => {
    expect(
      validateNativeCoordinates({
        lat: 41.8,
        lng: -87.7,
        state: 'CA',
        sourceUrl: chicagoUrl,
      })
    ).toEqual({ ok: false, reason: 'state_mismatch' })
  })
})
