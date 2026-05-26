import { geocodeIngestedSaleById } from '@/lib/ingestion/geocodeWorker'
import { publishReadyIngestedSaleById } from '@/lib/ingestion/publishWorker'
import {
  isResolvedAddressPublishable,
  shouldDeferPublishForPendingAddress,
} from '@/lib/ingestion/publishPreflight'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type CatalogRepairFollowUpResult =
  | { kind: 'published'; publishedSaleId: string }
  | { kind: 'geocoded'; published: boolean; publishedSaleId?: string }
  | { kind: 'refreshed_ready'; published: boolean }
  | { kind: 'skipped_not_eligible'; reason: string }
  | { kind: 'failed'; reason: string }

type IngestedRepairRow = {
  status: string
  lat: number | null
  lng: number | null
  published_sale_id: string | null
  normalized_address: string | null
  city: string | null
  state: string | null
  source_url: string | null
  address_status: string | null
}

async function loadIngestedStatusRow(
  admin: ReturnType<typeof getAdminDb>,
  ingestedSaleId: string
): Promise<IngestedRepairRow | null> {
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select(
      'status, lat, lng, published_sale_id, normalized_address, city, state, source_url, address_status'
    )
    .eq('id', ingestedSaleId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as IngestedRepairRow
  return row
}

function hasPublishableCoords(lat: number | null, lng: number | null): boolean {
  return lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
}

function rowNeedsAddressBeforePublish(row: IngestedRepairRow): boolean {
  return shouldDeferPublishForPendingAddress({
    normalized_address: row.normalized_address,
    city: row.city,
    state: row.state,
    source_url: row.source_url,
    address_status: row.address_status,
  })
}

async function reclassifyRowForAddressEnrichment(
  admin: ReturnType<typeof getAdminDb>,
  ingestedSaleId: string,
  row: IngestedRepairRow
): Promise<boolean> {
  const addressStatus =
    row.address_status === 'address_gated' ? 'address_gated' : 'address_enrichment_pending'
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update({
      status: 'needs_check',
      address_status: addressStatus,
      failure_reasons: [],
      failure_details: null,
    })
    .eq('id', ingestedSaleId)
    .in('status', ['publish_failed', 'ready'])
    .select('id')
    .maybeSingle()
  if (error || !data?.id) return false
  return true
}

async function resetPublishFailedToReady(
  admin: ReturnType<typeof getAdminDb>,
  ingestedSaleId: string
): Promise<boolean> {
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .update({ status: 'ready', failure_reasons: [], failure_details: null })
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

  if (rowNeedsAddressBeforePublish(row)) {
    if (row.status === 'publish_failed' || row.status === 'ready') {
      await reclassifyRowForAddressEnrichment(admin, ingestedSaleId, row)
    }
    return { kind: 'skipped_not_eligible', reason: 'publish_pending_address' }
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
    if (!hasPublishableCoords(row.lat, row.lng)) {
      return { kind: 'skipped_not_eligible', reason: 'publish_failed_no_coords' }
    }
    if (
      !isResolvedAddressPublishable(row.normalized_address, row.city, row.state)
    ) {
      await reclassifyRowForAddressEnrichment(admin, ingestedSaleId, row)
      return { kind: 'skipped_not_eligible', reason: 'publish_pending_address' }
    }
    await resetPublishFailedToReady(admin, ingestedSaleId)
  }

  if (row.status === 'ready' || row.status === 'publish_failed') {
    const refreshed = await loadIngestedStatusRow(admin, ingestedSaleId)
    if (!refreshed || refreshed.status !== 'ready') {
      return { kind: 'skipped_not_eligible', reason: 'not_ready_after_reset' }
    }
    if (!hasPublishableCoords(refreshed.lat, refreshed.lng)) {
      return { kind: 'skipped_not_eligible', reason: 'ready_missing_coords' }
    }
    if (rowNeedsAddressBeforePublish(refreshed)) {
      await reclassifyRowForAddressEnrichment(admin, ingestedSaleId, refreshed)
      return { kind: 'skipped_not_eligible', reason: 'publish_pending_address' }
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
