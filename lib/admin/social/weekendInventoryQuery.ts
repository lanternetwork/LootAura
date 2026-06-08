import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { T } from '@/lib/supabase/tables'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { isPostgrestMissingModerationStatusColumn } from '@/lib/sales/isPostgrestMissingModerationStatusColumn'
import { buildMetroSlug, getStatesForTimezone, getUniqueMetroTimezones } from '@/lib/seo/metroCatalog'
import { getThisWeekendWindowInMetro, saleOverlapsDateRange } from '@/lib/seo/weekendBoundaries'
import type { SeoMetro } from '@/lib/seo/types'
import type { SocialCityReportMapPin } from '@/lib/admin/social/socialCityReportTypes'

const PAGE_SIZE = 1000
export const SOCIAL_REPORT_MAP_PIN_LIMIT = 500

type SaleDateRow = {
  city: string | null
  state: string | null
  date_start: string | null
  date_end: string | null
}

type MapPinRow = SaleDateRow & {
  id: string
  lat: number | null
  lng: number | null
  title: string | null
  is_featured: boolean | null
}

async function fetchPaginatedRows<T>(
  buildQuery: (includeModeration: boolean) => ReturnType<typeof fromBase>,
  includeModeration: boolean
): Promise<T[]> {
  const rows: T[] = []
  let offset = 0

  while (true) {
    const query = buildQuery(includeModeration).range(offset, offset + PAGE_SIZE - 1)
    const { data, error } = await query

    if (error) {
      throw error
    }

    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) {
      break
    }
    offset += PAGE_SIZE
  }

  return rows
}

async function runWithModerationRetry<T>(
  run: (includeModeration: boolean) => Promise<T>
): Promise<T> {
  try {
    return await run(true)
  } catch (error) {
    if (isPostgrestMissingModerationStatusColumn(error)) {
      return run(false)
    }
    throw error
  }
}

function incrementSlugCount(
  countsBySlug: Record<string, number>,
  city: string | null | undefined,
  state: string | null | undefined
): void {
  if (!city?.trim() || !state?.trim()) return
  const slug = buildMetroSlug(city, state)
  countsBySlug[slug] = (countsBySlug[slug] ?? 0) + 1
}

/**
 * Nationwide weekend-overlap counts keyed by metro slug.
 * One paginated query per distinct timezone (aggregate, not per-city inventory fetch).
 */
export async function fetchWeekendInventoryCountsBySlug(
  metros: SeoMetro[],
  now: Date = new Date()
): Promise<Record<string, number>> {
  const countsBySlug: Record<string, number> = {}
  for (const metro of metros) {
    countsBySlug[metro.slug] = 0
  }

  const admin = getAdminDb()
  const timezones = getUniqueMetroTimezones(metros)

  for (const timezone of timezones) {
    const weekend = getThisWeekendWindowInMetro(timezone, now)
    const states = getStatesForTimezone(timezone)
    if (states.length === 0) continue

    const rows = await runWithModerationRetry((includeModeration) =>
      fetchPaginatedRows<SaleDateRow>(
        (includeMod) =>
          applyPhase4PublicPublishedSaleReadFilters(
            fromBase(admin, T.sales)
              .select('city, state, date_start, date_end')
              .in('state', states)
              .not('date_start', 'is', null),
            { includeModeration: includeMod, now }
          ),
        includeModeration
      )
    )

    for (const row of rows) {
      if (!saleOverlapsDateRange(row, weekend.start, weekend.end)) continue
      incrementSlugCount(countsBySlug, row.city, row.state)
    }
  }

  return countsBySlug
}

/** Map pins for a single metro's weekend-overlap inventory (phase4 + overlap only). */
export async function fetchWeekendMapPinsForMetro(
  metro: SeoMetro,
  now: Date = new Date()
): Promise<SocialCityReportMapPin[]> {
  const admin = getAdminDb()
  const weekend = getThisWeekendWindowInMetro(metro.timezone, now)

  const rows = await runWithModerationRetry((includeModeration) =>
    fetchPaginatedRows<MapPinRow>(
      (includeMod) =>
        applyPhase4PublicPublishedSaleReadFilters(
          fromBase(admin, T.sales)
            .select('id, lat, lng, title, is_featured, city, state, date_start, date_end')
            .ilike('city', metro.city)
            .eq('state', metro.state)
            .not('date_start', 'is', null),
          { includeModeration: includeMod, now }
        ),
      includeModeration
    )
  )

  const pins: SocialCityReportMapPin[] = []
  for (const row of rows) {
    if (!saleOverlapsDateRange(row, weekend.start, weekend.end)) continue
    if (typeof row.lat !== 'number' || typeof row.lng !== 'number') continue
    pins.push({
      id: row.id,
      lat: row.lat,
      lng: row.lng,
      title: row.title?.trim() || 'Sale',
      is_featured: row.is_featured === true,
    })
    if (pins.length >= SOCIAL_REPORT_MAP_PIN_LIMIT) break
  }

  return pins
}
