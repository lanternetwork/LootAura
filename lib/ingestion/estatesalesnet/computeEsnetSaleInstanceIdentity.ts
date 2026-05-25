import {
  buildSaleInstanceKey,
  canonicalDateWindow,
  computeSourceLocationHash,
  normalizeLocationBucket,
} from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import { canonicalKeyFromSaleInstanceIdentity } from '@/lib/ingestion/identity/computeCanonicalSaleInstanceKey'
import type { SaleInstanceIdentityFields } from '@/lib/ingestion/identity/saleInstanceIdentityTypes'
import {
  computeContentHash,
  computeScheduleHash,
} from '@/lib/reconciliation/sourceHashing'
import { createHash } from 'node:crypto'
import { extractEsnetSourceListingId } from '@/lib/ingestion/estatesalesnet/esnetSourceListingId'
import { isEstatesalesNetSourceUrl } from '@/lib/ingestion/estatesalesnet/esnetHosts'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

function stablePayloadHash(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload || typeof payload !== 'object') return null
  const keys = Object.keys(payload).sort()
  const normalized: Record<string, unknown> = {}
  for (const k of keys) normalized[k] = payload[k]
  return sha256Hex(JSON.stringify(normalized))
}

export type ComputeEsnetSaleInstanceIdentityInput = {
  sourcePlatform: string
  sourceUrl: string
  state: string | null
  city: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  title?: string | null
  description?: string | null
  lat?: number | null
  lng?: number | null
  rawPayload?: Record<string, unknown> | null
  seenAtIso?: string
}

export function computeEsnetSaleInstanceIdentity(
  input: ComputeEsnetSaleInstanceIdentityInput
): SaleInstanceIdentityFields | null {
  if (input.sourcePlatform !== ESNET_SOURCE_PLATFORM && !isEstatesalesNetSourceUrl(input.sourceUrl)) {
    return null
  }

  const seenAt = input.seenAtIso ?? new Date().toISOString()
  const sourceListingId =
    extractEsnetSourceListingId(input.sourceUrl) ??
    (typeof input.rawPayload?.esnetSaleId === 'number'
      ? String(input.rawPayload.esnetSaleId)
      : typeof input.rawPayload?.externalId === 'string'
        ? input.rawPayload.externalId
        : null)

  const locationBucket = normalizeLocationBucket({
    state: input.state,
    city: input.city,
    normalizedAddress: input.normalizedAddress,
  })
  const dateWindow = canonicalDateWindow(input.dateStart, input.dateEnd)
  const sourceContentHash = computeContentHash(input.title, input.description)
  const sourceScheduleHash = computeScheduleHash({
    dateStart: input.dateStart,
    dateEnd: input.dateEnd,
    timeStart: null,
    timeEnd: null,
    listingTimezone: null,
    descriptionScheduleAux: null,
  })
  const sourceLocationHash = computeSourceLocationHash({
    state: input.state,
    city: input.city,
    normalizedAddress: input.normalizedAddress,
    lat: input.lat,
    lng: input.lng,
  })
  const sourcePayloadHash = stablePayloadHash(input.rawPayload ?? null)
  const saleInstanceKey = buildSaleInstanceKey({
    sourcePlatform: ESNET_SOURCE_PLATFORM,
    locationBucket,
    dateWindow,
    sourceListingId,
    sourceContentHash,
  })
  const saleInstanceFingerprint = sha256Hex(
    JSON.stringify({
      saleInstanceKey,
      sourceContentHash,
      sourceScheduleHash,
      sourceLocationHash,
      sourceListingId,
    })
  )

  const canonical_sale_instance_key = canonicalKeyFromSaleInstanceIdentity({
    state: input.state,
    city: input.city,
    normalizedAddress: input.normalizedAddress,
    dateStart: input.dateStart,
    dateEnd: input.dateEnd,
    sourceScheduleHash: sourceScheduleHash,
    sourceLocationHash: sourceLocationHash,
    lat: input.lat,
    lng: input.lng,
  })

  return {
    source_listing_id: sourceListingId,
    sale_instance_key: saleInstanceKey,
    sale_instance_fingerprint: saleInstanceFingerprint,
    canonical_sale_instance_key,
    source_payload_hash: sourcePayloadHash,
    source_content_hash: sourceContentHash,
    source_schedule_hash: sourceScheduleHash,
    source_location_hash: sourceLocationHash,
    source_url_first_seen_at: seenAt,
    source_url_last_seen_at: seenAt,
  }
}
