import {
  buildReconciledScheduleBundle,
  type ReconciledScheduleBundleResult,
} from '@/lib/reconciliation/reconciledScheduleBundle'
import type { ParsedListingSnapshotForReconciliation } from '@/lib/reconciliation/reconciliationParseSnapshot'
import { resolvePersistableSaleEndsAt, type AdminDbForSaleEnds } from '@/lib/sales/resolvePersistableSaleEndsAt'

function normalizeTextOrNull(value: string | null | undefined): string | null {
  if (value == null) return null
  const t = String(value).trim()
  return t.length > 0 ? t : null
}

export type SaleScheduleForBundleCompare = {
  readonly date_start: string | null
  readonly date_end: string | null
  readonly time_start: string | null
  readonly time_end: string | null
}

/** Normalize schedule date columns for strict equality (null/empty → null). */
export function normalizeScheduleDateField(value: string | null | undefined): string | null {
  return normalizeTextOrNull(value)
}

/** Normalize schedule time columns to `HH:MM:SS` for strict equality. */
export function normalizeScheduleTimeField(value: string | null | undefined): string | null {
  const t = normalizeTextOrNull(value)
  if (!t) return null
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return t
  const hour = Number.parseInt(m[1], 10)
  const min = Number.parseInt(m[2], 10)
  const sec = m[3] != null ? Number.parseInt(m[3], 10) : 0
  if (!Number.isFinite(hour) || !Number.isFinite(min) || !Number.isFinite(sec)) return t
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * True when persisted `sales` schedule columns differ from a valid canonical reconciliation bundle.
 * Ingest `time_*` are not consulted — only the published sale row vs bundle authority.
 */
export function saleScheduleDiffersFromCanonicalBundle(
  sale: SaleScheduleForBundleCompare,
  bundle: ReconciledScheduleBundleResult
): boolean {
  if (!bundle.ok) return false
  const saleNorm = {
    date_start: normalizeScheduleDateField(sale.date_start),
    date_end: normalizeScheduleDateField(sale.date_end),
    time_start: normalizeScheduleTimeField(sale.time_start),
    time_end: normalizeScheduleTimeField(sale.time_end),
  }
  const bundleNorm = {
    date_start: normalizeScheduleDateField(bundle.dateStart),
    date_end: normalizeScheduleDateField(bundle.dateEnd),
    time_start: normalizeScheduleTimeField(bundle.timeStart),
    time_end: normalizeScheduleTimeField(bundle.timeEnd),
  }
  return (
    saleNorm.date_start !== bundleNorm.date_start ||
    saleNorm.date_end !== bundleNorm.date_end ||
    saleNorm.time_start !== bundleNorm.time_start ||
    saleNorm.time_end !== bundleNorm.time_end
  )
}

export type CanonicalLinkedSaleSchedulePatchInput = {
  readonly admin: AdminDbForSaleEnds
  readonly refreshedDescription: string | null | undefined
  readonly ingest: {
    readonly date_start: string | null
    readonly date_end: string | null
    readonly time_start: string | null
    readonly time_end: string | null
    readonly raw_payload: unknown
  }
  readonly sale: SaleScheduleForBundleCompare | null
  readonly parsed?: ParsedListingSnapshotForReconciliation | null
  readonly lat: number | null
  readonly lng: number | null
  readonly zip_code: string | null
  readonly state: string | null
  readonly rowId: string
  readonly saleId: string
  readonly operation: string
  /** When true, omit schedule patch if sale already matches the canonical bundle. */
  readonly skipWhenSaleMatchesBundle?: boolean
}

export type CanonicalLinkedSaleSchedulePatchResult = {
  readonly bundle: ReconciledScheduleBundleResult
  readonly schedulePatch: Record<string, string> | null
  readonly schedulesUpdated: boolean
  readonly scheduleMutationInhibited?: boolean
  readonly scheduleMutationInhibitedReason?: string
  readonly scheduleBundleReason: string | null
  readonly scheduleDriftFromBundle: boolean
}

/**
 * Single canonical schedule policy for linked-sale updates (reingest publish sync + Phase 2A).
 * Uses `buildReconciledScheduleBundle` (prose window wins over stale ingest/sale times).
 * Schedule mutation is all-or-nothing: dates, times, ends_at, listing_timezone — or none.
 */
export async function buildCanonicalLinkedSaleSchedulePatch(
  input: CanonicalLinkedSaleSchedulePatchInput
): Promise<CanonicalLinkedSaleSchedulePatchResult> {
  const bundle = buildReconciledScheduleBundle({
    refreshedDescription: input.refreshedDescription,
    parsed: input.parsed ?? null,
    ingest: input.ingest,
    sale: input.sale,
    lat: input.lat,
    lng: input.lng,
  })
  const scheduleBundleReason = bundle.schedule_bundle_reason

  if (!bundle.ok) {
    return {
      bundle,
      schedulePatch: null,
      schedulesUpdated: false,
      scheduleMutationInhibited: true,
      scheduleMutationInhibitedReason: bundle.schedule_bundle_reason,
      scheduleBundleReason,
      scheduleDriftFromBundle: false,
    }
  }

  const scheduleDriftFromBundle =
    input.sale != null && saleScheduleDiffersFromCanonicalBundle(input.sale, bundle)

  if (input.skipWhenSaleMatchesBundle && input.sale != null && !scheduleDriftFromBundle) {
    return {
      bundle,
      schedulePatch: null,
      schedulesUpdated: false,
      scheduleBundleReason,
      scheduleDriftFromBundle: false,
    }
  }

  const lat = Number(input.lat ?? NaN)
  const lng = Number(input.lng ?? NaN)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      bundle,
      schedulePatch: null,
      schedulesUpdated: false,
      scheduleMutationInhibited: true,
      scheduleMutationInhibitedReason: 'missing_coordinates',
      scheduleBundleReason,
      scheduleDriftFromBundle,
    }
  }

  const listingEnds = await resolvePersistableSaleEndsAt(
    input.admin,
    {
      date_start: bundle.dateStart,
      time_start: bundle.timeStart,
      date_end: bundle.dateEnd,
      time_end: bundle.timeEnd,
      zip_code: input.zip_code,
      state: input.state,
      lat,
      lng,
    },
    { operation: input.operation, rowId: input.rowId, saleId: input.saleId }
  )

  if (listingEnds.ends_at == null) {
    return {
      bundle,
      schedulePatch: null,
      schedulesUpdated: false,
      scheduleMutationInhibited: true,
      scheduleMutationInhibitedReason: 'ends_at_unresolved',
      scheduleBundleReason,
      scheduleDriftFromBundle,
    }
  }

  const schedulePatch: Record<string, string> = {
    date_start: bundle.dateStart,
    date_end: bundle.dateEnd,
    time_start: bundle.timeStart,
    time_end: bundle.timeEnd,
    ends_at: listingEnds.ends_at,
  }
  if (listingEnds.listing_timezone != null) {
    schedulePatch.listing_timezone = listingEnds.listing_timezone
  }

  return {
    bundle,
    schedulePatch,
    schedulesUpdated: true,
    scheduleBundleReason,
    scheduleDriftFromBundle,
  }
}
