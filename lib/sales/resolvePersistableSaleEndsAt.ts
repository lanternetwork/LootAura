import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { computeSaleEndsAt } from '@/lib/sales/computeSaleEndsAt'
import {
  resolveListingTimezoneForSale,
  type ResolveListingTimezoneResult,
} from '@/lib/sales/resolveListingTimezone'

export type AdminDbForSaleEnds = ReturnType<typeof getAdminDb>

export type PersistableSaleEndsInput = {
  date_start: string
  time_start: string | null
  date_end: string | null
  time_end: string | null
  zip_code: string | null | undefined
  state: string | null | undefined
  lat: number
  lng: number
}

export type DiagnoseSaleListingEndsResult =
  | {
      outcome: 'ok'
      ends_at: string
      listing_timezone: string
      timezone_source: 'zip5' | 'lat_lng'
    }
  | {
      outcome: 'tz_unresolved'
      reason: Extract<ResolveListingTimezoneResult, { ok: false }>['reason']
    }
  | {
      outcome: 'compute_failed'
      listing_timezone: string
      timezone_source: 'zip5' | 'lat_lng'
      computeReason: 'invalid_timezone' | 'invalid_date' | 'invalid_time' | 'wall_clock_unresolvable'
    }

/**
 * Pure resolution path for listing end + IANA zone (no logging). Used by backfill metrics and `resolvePersistableSaleEndsAt`.
 */
export async function diagnoseSaleListingEnds(
  admin: AdminDbForSaleEnds,
  dates: PersistableSaleEndsInput
): Promise<DiagnoseSaleListingEndsResult> {
  const tzRes = await resolveListingTimezoneForSale(admin, {
    zipCode: dates.zip_code,
    state: dates.state,
    lat: dates.lat,
    lng: dates.lng,
  })

  if (!tzRes.ok) {
    return { outcome: 'tz_unresolved', reason: tzRes.reason }
  }

  const computed = computeSaleEndsAt({
    date_start: dates.date_start,
    time_start: dates.time_start,
    date_end: dates.date_end,
    time_end: dates.time_end,
    listingTimezone: tzRes.iana,
  })

  if (!computed.ok) {
    return {
      outcome: 'compute_failed',
      listing_timezone: tzRes.iana,
      timezone_source: tzRes.source,
      computeReason: computed.reason,
    }
  }

  return {
    outcome: 'ok',
    ends_at: computed.endsAtIso,
    listing_timezone: tzRes.iana,
    timezone_source: tzRes.source,
  }
}

/**
 * Resolves `listing_timezone` (IANA) then `ends_at` (UTC ISO).
 * On resolution/compute failure: returns nulls and logs (additive phase — callers still persist sale).
 */
export async function resolvePersistableSaleEndsAt(
  admin: AdminDbForSaleEnds,
  dates: PersistableSaleEndsInput,
  logCtx: Record<string, unknown>
): Promise<{ ends_at: string | null; listing_timezone: string | null }> {
  const d = await diagnoseSaleListingEnds(admin, dates)

  if (d.outcome === 'tz_unresolved') {
    logger.warn('sale_listing_window: timezone unresolved (ends_at skipped)', {
      component: 'sales/listing_window',
      operation: 'resolve_listing_timezone',
      reason: d.reason,
      ...logCtx,
    })
    return { ends_at: null, listing_timezone: null }
  }

  if (d.outcome === 'compute_failed') {
    logger.warn('sale_listing_window: ends_at computation failed', {
      component: 'sales/listing_window',
      operation: 'compute_sale_ends_at',
      compute_reason: d.computeReason,
      timezone_source: d.timezone_source,
      listing_timezone: d.listing_timezone,
      ...logCtx,
    })
    return { ends_at: null, listing_timezone: d.listing_timezone }
  }

  logger.info('sale_listing_window: resolved ends_at', {
    component: 'sales/listing_window',
    operation: 'resolve_persistable_sale_ends_at',
    timezone_source: d.timezone_source,
    listing_timezone: d.listing_timezone,
    ...logCtx,
  })

  return { ends_at: d.ends_at, listing_timezone: d.listing_timezone }
}
