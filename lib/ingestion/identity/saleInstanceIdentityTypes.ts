/** Phase 3: persisted sale-instance identity columns (observability; no dedupe enforcement yet). */

export type SaleInstanceIdentityFields = {
  source_listing_id: string | null
  sale_instance_key: string | null
  sale_instance_fingerprint: string | null
  source_payload_hash: string | null
  source_content_hash: string | null
  source_schedule_hash: string | null
  source_location_hash: string | null
  source_url_first_seen_at: string | null
  source_url_last_seen_at: string | null
}

export type ComputeYstmSaleInstanceIdentityInput = {
  sourcePlatform: string
  sourceUrl: string
  state: string | null
  city: string | null
  normalizedAddress: string | null
  dateStart: string | null
  dateEnd: string | null
  timeStart?: string | null
  timeEnd?: string | null
  title?: string | null
  description?: string | null
  imageSourceUrl?: string | null
  lat?: number | null
  lng?: number | null
  rawPayload?: Record<string, unknown> | null
  seenAtIso?: string
}
