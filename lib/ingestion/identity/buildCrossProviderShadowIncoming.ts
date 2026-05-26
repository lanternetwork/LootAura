import { computeEsnetSaleInstanceIdentity } from '@/lib/ingestion/estatesalesnet/computeEsnetSaleInstanceIdentity'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'
import { computeYstmSaleInstanceIdentity } from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
export type CrossProviderShadowProbe = {
  sourceUrl: string
  state: string
  city: string
  title: string
  startDate: string | null
  endDate?: string | null
  lat?: number | null
  lng?: number | null
}

export function buildCrossProviderShadowIncoming(
  platform: string,
  probe: CrossProviderShadowProbe,
  normalizedAddress: string
): {
  canonicalSaleInstanceKey: string | null
  saleInstanceKey: string | null
} {
  const shared = {
    sourcePlatform: platform,
    sourceUrl: probe.sourceUrl,
    state: probe.state,
    city: probe.city,
    normalizedAddress,
    dateStart: probe.startDate,
    dateEnd: probe.endDate ?? null,
    title: probe.title,
    description: null,
    lat: probe.lat ?? null,
    lng: probe.lng ?? null,
    rawPayload: null,
  }

  const identity =
    platform === ESNET_SOURCE_PLATFORM
      ? computeEsnetSaleInstanceIdentity(shared)
      : computeYstmSaleInstanceIdentity(shared)

  return {
    canonicalSaleInstanceKey: identity?.canonical_sale_instance_key ?? null,
    saleInstanceKey: identity?.sale_instance_key ?? null,
  }
}
