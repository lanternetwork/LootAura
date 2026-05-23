import { createHash } from 'node:crypto'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import {
  computeContentHash,
  computeScheduleHash,
  normalizeWhitespace,
} from '@/lib/reconciliation/sourceHashing'
import type {
  ComputeYstmSaleInstanceIdentityInput,
  SaleInstanceIdentityFields,
} from '@/lib/ingestion/identity/saleInstanceIdentityTypes'
import { extractYstmSourceListingId } from '@/lib/ingestion/identity/ystmSourceListingId'

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

function stablePayloadHash(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload || typeof payload !== 'object') return null
  const keys = Object.keys(payload).sort()
  const normalized: Record<string, unknown> = {}
  for (const k of keys) {
    normalized[k] = payload[k]
  }
  return sha256Hex(JSON.stringify(normalized))
}

export function normalizeLocationBucket(input: {
  state: string | null
  city: string | null
  normalizedAddress: string | null
}): string {
  const state = (input.state ?? '').trim().toUpperCase() || 'XX'
  const city = normalizeWhitespace((input.city ?? '').toLowerCase()) || 'unknown'
  const addr = normalizeWhitespace((input.normalizedAddress ?? '').toLowerCase()) || 'no_addr'
  return `${state}|${city}|${addr}`
}

export function canonicalDateWindow(dateStart: string | null, dateEnd: string | null): string {
  const start = (dateStart ?? '').trim() || 'nodate'
  const end = (dateEnd ?? '').trim() || 'open'
  return `${start}|${end}`
}

export function computeSourceLocationHash(input: {
  state: string | null
  city: string | null
  normalizedAddress: string | null
  lat?: number | null
  lng?: number | null
}): string {
  const bucket = normalizeLocationBucket(input)
  const coord =
    input.lat != null && input.lng != null && Number.isFinite(input.lat) && Number.isFinite(input.lng)
      ? `${input.lat.toFixed(5)},${input.lng.toFixed(5)}`
      : ''
  return sha256Hex(`${bucket}|${coord}`)
}

/**
 * Canonical sale_instance_key: platform + location + date window + listing id (or content hash fallback).
 * Never uses title alone.
 */
export function buildSaleInstanceKey(input: {
  sourcePlatform: string
  locationBucket: string
  dateWindow: string
  sourceListingId: string | null
  sourceContentHash: string
}): string {
  const tail = input.sourceListingId?.trim() || `content:${input.sourceContentHash.slice(0, 16)}`
  return [
    input.sourcePlatform.trim(),
    input.locationBucket,
    input.dateWindow,
    tail,
  ].join(':')
}

/**
 * Returns identity fields for YSTM detail URLs; null when not a YSTM listing URL.
 */
export function computeYstmSaleInstanceIdentity(
  input: ComputeYstmSaleInstanceIdentityInput
): SaleInstanceIdentityFields | null {
  if (!isYstmDetailListingUrl(input.sourceUrl)) return null

  const seenAt = input.seenAtIso ?? new Date().toISOString()
  const sourceListingId = extractYstmSourceListingId(input.sourceUrl)
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
    timeStart: input.timeStart,
    timeEnd: input.timeEnd,
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
    sourcePlatform: input.sourcePlatform,
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

  return {
    source_listing_id: sourceListingId,
    sale_instance_key: saleInstanceKey,
    sale_instance_fingerprint: saleInstanceFingerprint,
    source_payload_hash: sourcePayloadHash,
    source_content_hash: sourceContentHash,
    source_schedule_hash: sourceScheduleHash,
    source_location_hash: sourceLocationHash,
    source_url_first_seen_at: seenAt,
    source_url_last_seen_at: seenAt,
  }
}

/** DB insert/update columns for Phase 3 (supersession fields left null until Phase 5+). */
export function saleInstanceIdentityDbColumns(
  identity: SaleInstanceIdentityFields | null
): Record<string, unknown> {
  if (!identity) {
    return {
      source_listing_id: null,
      sale_instance_key: null,
      sale_instance_fingerprint: null,
      source_payload_hash: null,
      source_content_hash: null,
      source_schedule_hash: null,
      source_location_hash: null,
      source_url_first_seen_at: null,
      source_url_last_seen_at: null,
      supersedes_ingested_sale_id: null,
      superseded_by_ingested_sale_id: null,
      superseded_sale_id: null,
      superseded_at: null,
      superseded_reason: null,
    }
  }
  return {
    source_listing_id: identity.source_listing_id,
    sale_instance_key: identity.sale_instance_key,
    sale_instance_fingerprint: identity.sale_instance_fingerprint,
    source_payload_hash: identity.source_payload_hash,
    source_content_hash: identity.source_content_hash,
    source_schedule_hash: identity.source_schedule_hash,
    source_location_hash: identity.source_location_hash,
    source_url_first_seen_at: identity.source_url_first_seen_at,
    source_url_last_seen_at: identity.source_url_last_seen_at,
    supersedes_ingested_sale_id: null,
    superseded_by_ingested_sale_id: null,
    superseded_sale_id: null,
    superseded_at: null,
    superseded_reason: null,
  }
}
