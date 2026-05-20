import { geocodeIngestedSaleById } from '@/lib/ingestion/geocodeWorker'
import { publishReadyIngestedSaleById } from '@/lib/ingestion/publishWorker'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type CatalogRepairFollowUpResult =
  | { kind: 'published'; publishedSaleId: string }
  | { kind: 'geocoded'; published: boolean; publishedSaleId?: string }
  | { kind: 'refreshed_ready'; published: boolean }
  | { kind: 'skipped_not_eligible'; reason: string }
  | { kind: 'failed'; reason: string }

async function loadIngestedStatusRow(
  admin: ReturnType<typeof getAdminDb>,
  ingestedSaleId: string
): Promise<{
  status: string
  lat: number | null
  lng: number | null
  published_sale_id: string | null
} | null> {
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('status, lat, lng, published_sale_id')
    .eq('id', ingestedSaleId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as {
    status: string
    lat: number | null
    lng: number | null
    published_sale_id: string | null
  }
  return {
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    published_sale_id: row.published_sale_id,
  }
}

function hasPublishableCoords(lat: number | null, lng: number | null): boolean {
  return lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
}

async function resetPublishFailedToReady(
  admin: ReturnType<typeof getAdminDb>,
  ingestedSaleId: string
): Promise<boolean> {
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update({ status: 'ready', failure_reasons: [] })
    .eq('id', ingestedSaleId)
    .eq('status', 'publish_failed')
    .select('id')
    .maybeSingle()
  if (error || !data?.id) return false
  return true
}

/**
 * After detail-first refresh, drive geocode/publish lifecycle for repairable YSTM rows.
 */
export async function followUpCatalogRepairPublishOrGeocode(
  admin: ReturnType<typeof getAdminDb>,
  ingestedSaleId: string
): Promise<CatalogRepairFollowUpResult> {
  const row = await loadIngestedStatusRow(admin, ingestedSaleId)
  if (!row) {
    return { kind: 'failed', reason: 'row_not_found' }
  }

  if (row.status === 'published' || row.published_sale_id) {
    return { kind: 'published', publishedSaleId: String(row.published_sale_id) }
  }

  if (row.status === 'needs_geocode') {
    const geo = await geocodeIngestedSaleById(ingestedSaleId)
    if (geo.outcome === 'success') {
      if (geo.published && geo.publishedSaleId) {
        return { kind: 'geocoded', published: true, publishedSaleId: geo.publishedSaleId }
      }
      return { kind: 'geocoded', published: false }
    }
    if (geo.outcome === 'skipped') {
      return { kind: 'skipped_not_eligible', reason: geo.reason }
    }
    return { kind: 'failed', reason: geo.outcome === 'publish_failed' ? geo.error : 'geocode_failed' }
  }

  if (row.status === 'publish_failed') {
    if (hasPublishableCoords(row.lat, row.lng)) {
      await resetPublishFailedToReady(admin, ingestedSaleId)
    } else {
      return { kind: 'skipped_not_eligible', reason: 'publish_failed_no_coords' }
    }
  }

  if (row.status === 'ready' || row.status === 'publish_failed') {
    const refreshed = await loadIngestedStatusRow(admin, ingestedSaleId)
    if (!refreshed || refreshed.status !== 'ready') {
      return { kind: 'skipped_not_eligible', reason: 'not_ready_after_reset' }
    }
    if (!hasPublishableCoords(refreshed.lat, refreshed.lng)) {
      return { kind: 'skipped_not_eligible', reason: 'ready_missing_coords' }
    }
    const pub = await publishReadyIngestedSaleById(ingestedSaleId)
    if (pub.ok && 'publishedSaleId' in pub) {
      return { kind: 'published', publishedSaleId: pub.publishedSaleId }
    }
    if (pub.ok && 'skipped' in pub && pub.skipped) {
      return { kind: 'skipped_not_eligible', reason: pub.reason ?? 'publish_skipped' }
    }
    return { kind: 'failed', reason: 'error' in pub ? pub.error : 'publish_failed' }
  }

  if (row.status === 'needs_check') {
    return { kind: 'skipped_not_eligible', reason: 'needs_check_terminal' }
  }

  return { kind: 'skipped_not_eligible', reason: `status_${row.status}` }
}
