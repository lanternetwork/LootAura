import { z } from 'zod'
import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import { isYstmDetailListingUrl } from '@/lib/ingestion/images/ystmDetailListingUrl'
import { promoteIngestedSaleCoordinates } from '@/lib/ingestion/spatial/promoteIngestedSaleCoordinates'
import { lookupSpatialCoordinates } from '@/lib/ingestion/spatial/resolveSpatialCoordinates'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export const RemediateYstmNativeCoordinatesSchema = z.object({
  batchSize: z.number().int().min(1).max(100).default(75),
})

export type RemediateYstmNativeCoordinatesInput = z.infer<typeof RemediateYstmNativeCoordinatesSchema>

export type RemediateYstmNativeCoordinatesSummary = {
  scanned: number
  promoted: number
  skipped: number
  fetchFailed: number
  noCoords: number
}

function isBlockedOrCaptchaHtml(html: string): boolean {
  const sample = html.slice(0, 8000).toLowerCase()
  return (
    sample.includes('captcha') ||
    sample.includes('cf-browser-verification') ||
    sample.includes('attention required') ||
    sample.includes('access denied') ||
    sample.includes('rate limit')
  )
}

function isYstmSourceUrl(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl?.trim()) return false
  try {
    return /(?:^|\.)yardsaletreasuremap\.(?:com|net|org)$/i.test(new URL(sourceUrl.trim()).hostname)
  } catch {
    return false
  }
}

/**
 * Bounded backfill: fetch YSTM detail HTML, extract native coords, promote to ready + publish.
 * Does not move already-published pins; only `needs_geocode` rows with null coordinates.
 */
export async function remediateYstmNativeCoordinatesBacklog(
  input: RemediateYstmNativeCoordinatesInput
): Promise<RemediateYstmNativeCoordinatesSummary> {
  const parsed = RemediateYstmNativeCoordinatesSchema.parse(input)
  const admin = getAdminDb()
  const summary: RemediateYstmNativeCoordinatesSummary = {
    scanned: 0,
    promoted: 0,
    skipped: 0,
    fetchFailed: 0,
    noCoords: 0,
  }

  const { data: rows, error } = await fromBase(admin, 'ingested_sales')
    .select('id, source_url, address_raw, normalized_address, city, state, status, lat, lng, address_status')
    .eq('status', 'needs_geocode')
    .eq('address_status', 'address_available')
    .is('lat', null)
    .is('lng', null)
    .is('published_sale_id', null)
    .order('updated_at', { ascending: true })
    .limit(parsed.batchSize * 3)

  if (error) {
    throw new Error(error.message)
  }

  for (const row of rows ?? []) {
    if (summary.promoted >= parsed.batchSize) break
    summary.scanned += 1

    const id = String(row.id)
    const sourceUrl = row.source_url != null ? String(row.source_url) : ''
    const addressRaw = row.address_raw != null ? String(row.address_raw) : null
    const city = row.city != null ? String(row.city) : ''
    const state = row.state != null ? String(row.state) : ''

    if (!isYstmSourceUrl(sourceUrl) || !isYstmDetailListingUrl(sourceUrl)) {
      summary.skipped += 1
      continue
    }
    if (!isAddressGeocodeReady(addressRaw)) {
      summary.skipped += 1
      continue
    }

    const cachedOnly = await lookupSpatialCoordinates({
      addressRaw,
      normalizedAddress: row.normalized_address != null ? String(row.normalized_address) : null,
      city,
      state,
      sourceUrl,
      pageHtml: null,
    })
    if (cachedOnly) {
      const promoted = await promoteIngestedSaleCoordinates(id, cachedOnly.lat, cachedOnly.lng, {
        geocode_confidence: cachedOnly.geocode_confidence,
        coordinate_precision: cachedOnly.coordinate_precision,
        geocode_method: cachedOnly.geocode_method,
      })
      if (promoted.kind === 'geocoded') {
        summary.promoted += 1
      } else {
        summary.skipped += 1
      }
      continue
    }

    let html: string
    try {
      html = await fetchSafeExternalPageHtml(sourceUrl, {
        city: city || 'Unknown',
        state: state || 'ZZ',
        pageIndex: 0,
        adapter: 'ystm_native_backfill_2a',
      })
    } catch (e) {
      summary.fetchFailed += 1
      logger.warn('YSTM native backfill fetch failed', {
        component: 'ingestion/spatial/remediateYstmNativeCoordinatesBacklog',
        operation: 'fetch',
        rowId: id,
        message: e instanceof Error ? e.message : String(e),
      })
      continue
    }

    if (isBlockedOrCaptchaHtml(html)) {
      summary.fetchFailed += 1
      continue
    }

    const spatial = await lookupSpatialCoordinates({
      addressRaw,
      normalizedAddress: row.normalized_address != null ? String(row.normalized_address) : null,
      city,
      state,
      sourceUrl,
      pageHtml: html,
    })
    if (!spatial) {
      summary.noCoords += 1
      continue
    }

    const promoted = await promoteIngestedSaleCoordinates(id, spatial.lat, spatial.lng, {
      geocode_confidence: spatial.geocode_confidence,
      coordinate_precision: spatial.coordinate_precision,
      geocode_method: spatial.geocode_method,
    })
    if (promoted.kind === 'geocoded') {
      summary.promoted += 1
    } else {
      summary.skipped += 1
    }
  }

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.spatialRemediationBatch, {
      scanned: summary.scanned,
      promoted: summary.promoted,
      skipped: summary.skipped,
      fetchFailed: summary.fetchFailed,
      noCoords: summary.noCoords,
    })
  )

  return summary
}
