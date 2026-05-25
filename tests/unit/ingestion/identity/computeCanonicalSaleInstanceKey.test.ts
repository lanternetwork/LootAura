import { describe, expect, it } from 'vitest'
import { computeCanonicalSaleInstanceKey } from '@/lib/ingestion/identity/computeCanonicalSaleInstanceKey'
import { computeEsnetSaleInstanceIdentity } from '@/lib/ingestion/estatesalesnet/computeEsnetSaleInstanceIdentity'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'
import { computeYstmSaleInstanceIdentity } from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'

const YSTM_URL =
  'https://yardsaletreasuremap.com/US/KY/Louisville/Louisville.html/961002738/listing.html'

describe('computeCanonicalSaleInstanceKey', () => {
  it('returns null without address or date_start', () => {
    expect(
      computeCanonicalSaleInstanceKey({
        state: 'KY',
        city: 'Louisville',
        normalizedAddress: null,
        dateStart: '2026-05-30',
        dateEnd: null,
      })
    ).toBeNull()
  })

  it('is stable for normalized address casing', () => {
    const a = computeCanonicalSaleInstanceKey({
      state: 'KY',
      city: 'Louisville',
      normalizedAddress: '1200 bardstown rd',
      dateStart: '2026-05-30',
      dateEnd: '2026-05-30',
      lat: 38.23,
      lng: -85.72,
    })
    const b = computeCanonicalSaleInstanceKey({
      state: 'KY',
      city: 'Louisville',
      normalizedAddress: '1200 Bardstown Rd',
      dateStart: '2026-05-30',
      dateEnd: '2026-05-30',
      lat: 38.23,
      lng: -85.72,
    })
    expect(a).toHaveLength(64)
    expect(a).toBe(b)
  })

  it('differs when date window changes', () => {
    const a = computeCanonicalSaleInstanceKey({
      state: 'KY',
      city: 'Louisville',
      normalizedAddress: '1200 bardstown rd',
      dateStart: '2026-05-30',
      dateEnd: '2026-05-30',
    })
    const b = computeCanonicalSaleInstanceKey({
      state: 'KY',
      city: 'Louisville',
      normalizedAddress: '1200 bardstown rd',
      dateStart: '2026-06-15',
      dateEnd: '2026-06-15',
    })
    expect(a).not.toBe(b)
  })

  it('matches across YSTM and ES.net provider-local keys for same event', () => {
    const ystm = computeYstmSaleInstanceIdentity({
      sourcePlatform: 'external_page_source',
      sourceUrl: YSTM_URL,
      state: 'KY',
      city: 'Louisville',
      normalizedAddress: '1200 bardstown rd',
      dateStart: '2026-05-30',
      dateEnd: '2026-05-30',
      lat: 38.235,
      lng: -85.72,
    })
    const esnet = computeEsnetSaleInstanceIdentity({
      sourcePlatform: ESNET_SOURCE_PLATFORM,
      sourceUrl: 'https://www.estatesales.net/KY/Louisville/40222/4913946',
      state: 'KY',
      city: 'Louisville',
      normalizedAddress: '1200 bardstown rd',
      dateStart: '2026-05-30',
      dateEnd: '2026-05-30',
      lat: 38.235,
      lng: -85.72,
      rawPayload: { esnetSaleId: 4913946 },
    })
    expect(ystm?.canonical_sale_instance_key).toHaveLength(64)
    expect(esnet?.canonical_sale_instance_key).toBe(ystm?.canonical_sale_instance_key)
    expect(ystm?.sale_instance_key).not.toBe(esnet?.sale_instance_key)
  })
})
