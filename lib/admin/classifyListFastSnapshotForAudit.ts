import {
  classifyYstmListMetadataAsValidActive,
  deriveYstmListMetadataTitle,
} from '@/lib/ingestion/ystmCoverage/classifyYstmListMetadataAsValidActive'
import { coerceIngestedDateToYyyyMmDd } from '@/lib/ingestion/saleWindowDates'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import type { ListFastSnapshotCompletenessBucket } from '@/lib/admin/listFastFailureDistributionTypes'

function readCoord(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseFloat(raw.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

function readString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

/**
 * Parse embedded list_metadata_snapshot JSON into the shape used by list-fast publish.
 */
export function parseListMetadataSnapshotForAudit(raw: unknown, canonicalUrl: string): YstmListMetadataSale | null {
  if (raw == null || typeof raw !== 'object') return null
  const sale = raw as Record<string, unknown>
  const sourceUrl = readString(sale.sourceUrl) ?? readString(sale.url) ?? readString(sale.sale_url) ?? canonicalUrl
  if (!sourceUrl) return null

  return {
    canonicalUrl,
    sourceUrl,
    title: readString(sale.title),
    description: readString(sale.description),
    address: readString(sale.address),
    lat: readCoord(sale.lat ?? sale.latitude),
    lng: readCoord(sale.lng ?? sale.longitude),
    startDate:
      readString(sale.startDate) ??
      readString(sale.start_date) ??
      readString(sale.date_start) ??
      readString(sale.date),
    endDate:
      readString(sale.endDate) ?? readString(sale.end_date) ?? readString(sale.date_end),
    postedAt: readString(sale.postedAt) ?? readString(sale.posted_at),
    imageUrls: [],
  }
}

function hasUsableCoords(lat: number | null, lng: number | null): boolean {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
}

/**
 * Section C — snapshot completeness vs validity rules (not raw null checks only).
 */
export function classifyListFastSnapshotCompleteness(
  snapshot: YstmListMetadataSale | null
): ListFastSnapshotCompletenessBucket {
  if (!snapshot) return 'missing_snapshot'

  const validity = classifyYstmListMetadataAsValidActive(snapshot)
  if (validity.valid) return 'complete_snapshot'

  if (validity.reason === 'missing_dates') return 'missing_dates'
  if (validity.reason === 'missing_title') return 'missing_title'
  if (validity.reason === 'gated_only') return 'missing_address_and_coords'

  const title = deriveYstmListMetadataTitle(snapshot)
  if (!title?.trim()) return 'missing_title'
  if (!coerceIngestedDateToYyyyMmDd(snapshot.startDate) && !coerceIngestedDateToYyyyMmDd(snapshot.endDate)) {
    return 'missing_dates'
  }

  const addressPresent = Boolean(snapshot.address?.trim())
  const coordsPresent = hasUsableCoords(snapshot.lat, snapshot.lng)
  if (addressPresent && !coordsPresent) return 'missing_coords_only'

  return 'validity_rejected_other'
}
