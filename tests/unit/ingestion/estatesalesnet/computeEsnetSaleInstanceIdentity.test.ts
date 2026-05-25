import { describe, expect, it } from 'vitest'
import { computeEsnetSaleInstanceIdentity } from '@/lib/ingestion/estatesalesnet/computeEsnetSaleInstanceIdentity'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'

describe('computeEsnetSaleInstanceIdentity', () => {
  it('builds identity for canonical ES.net detail URL', () => {
    const fields = computeEsnetSaleInstanceIdentity({
      sourcePlatform: ESNET_SOURCE_PLATFORM,
      sourceUrl: 'https://www.estatesales.net/KY/Louisville/40222/4913946',
      state: 'KY',
      city: 'Louisville',
      normalizedAddress: '1200 bardstown rd',
      dateStart: '2026-05-30',
      dateEnd: '2026-05-30',
      title: 'Historic Highlands Tag Sale',
      description: null,
      lat: 38.235,
      lng: -85.72,
      rawPayload: { esnetSaleId: 4913946, externalId: '4913946' },
    })

    expect(fields?.source_listing_id).toBe('4913946')
    expect(fields?.sale_instance_key).toContain('estatesales_net:')
    expect(fields?.sale_instance_key).toContain('4913946')
  })
})
