import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { T } from '@/lib/supabase/tables'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { isPostgrestMissingModerationStatusColumn } from '@/lib/sales/isPostgrestMissingModerationStatusColumn'
import { getStatesForTimezone, getUniqueMetroTimezones } from '@/lib/seo/metroCatalog'
import { getThisWeekendWindowInMetro, saleOverlapsDateRange } from '@/lib/seo/weekendBoundaries'
import type { SeoMetro } from '@/lib/seo/types'
import {
  buildMarketBoundsAroundAnchor,
  buildMetroMarketAnchorsBySlug,
  resolveMetroSlugForSale,
  type MetroMarketAnchor,
  type MetroMarketBounds,
} from '@/lib/admin/social/metroMarketGeography'
import type { SocialCityReportMapPin } from '@/lib/admin/social/socialCityReportTypes'

const PAGE_SIZE = 1000
export const SOCIAL_REPORT_MAP_PIN_LIMIT = 500

type SaleGeoRow = {
  city: string | null
  state: string | null
  date_start: string | null
  date_end: string | null
  lat?: number | null
  lng?: number | null
}

type MapPinRow = SaleGeoRow & {
  id: string
  title: string | null
  is_featured: boolean | null
}

export type MetroWeekendMapInventory = {
  pins: SocialCityReportMapPin[]
  pinsBeforeCap: number
  mapFitBounds: MetroMarketBounds | null
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

async function fetchAllGeoSaleRows(options: {
  states: string[]
  now: Date
}): Promise<SaleGeoRow[]> {
  const admin = getAdminDb()
  const rows: SaleGeoRow[] = []

  const fetchChunk = async (includeModeration: boolean) => {
    let offset = 0
    for (;;) {
      const { data, error } = await applyPhase4PublicPublishedSaleReadFilters(
        fromBase(admin, T.sales)
          .select('city, state, date_start, date_end, lat, lng')
          .in('state', options.states)
          .not('date_start', 'is', null),
        { includeModeration, now: options.now }
      ).range(offset, offset + PAGE_SIZE - 1)

      if (error) {
        throw error
      }

      const batch = (data ?? []) as SaleGeoRow[]
      rows.push(...batch)
      if (batch.length < PAGE_SIZE) {
        break
      }
      offset += PAGE_SIZE
    }
  }

  await runWithModerationRetry(fetchChunk)
  return rows
}

async function fetchGeoRowsInBbox(options: {
  bounds: MetroMarketBounds
  now: Date
}): Promise<MapPinRow[]> {
  const admin = getAdminDb()
  const rows: MapPinRow[] = []

  const fetchChunk = async (includeModeration: boolean) => {
    let offset = 0
    for (;;) {
      const { data, error } = await applyPhase4PublicPublishedSaleReadFilters(
        fromBase(admin, T.sales)
          .select('id, lat, lng, title, is_featured, city, state, date_start, date_end')
          .gte('lat', options.bounds.south)
          .lte('lat', options.bounds.north)
          .gte('lng', options.bounds.west)
          .lte('lng', options.bounds.east)
          .not('date_start', 'is', null)
          .not('lat', 'is', null)
          .not('lng', 'is', null),
        { includeModeration, now: options.now }
      )
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) {
        throw error
      }

      const batch = (data ?? []) as MapPinRow[]
      rows.push(...batch)
      if (batch.length < PAGE_SIZE) {
        break
      }
      offset += PAGE_SIZE
    }
  }

  await runWithModerationRetry(fetchChunk)
  return rows
}

/**
 * Nationwide weekend-overlap counts keyed by metro slug (market geography).
 */
export async function fetchWeekendInventoryCountsBySlug(
  metros: SeoMetro[],
  now: Date = new Date(),
  anchorsBySlug?: Record<string, MetroMarketAnchor | null>
): Promise<Record<string, number>> {
  const countsBySlug: Record<string, number> = {}
  for (const metro of metros) {
    countsBySlug[metro.slug] = 0
  }

  const anchors = anchorsBySlug ?? buildMetroMarketAnchorsBySlug(metros)
  const timezones = getUniqueMetroTimezones(metros)

  for (const timezone of timezones) {
    const weekend = getThisWeekendWindowInMetro(timezone, now)
    const states = getStatesForTimezone(timezone)
    if (states.length === 0) continue

    const rows = await fetchAllGeoSaleRows({ states, now })

    for (const row of rows) {
      if (!saleOverlapsDateRange(row, weekend.start, weekend.end)) continue
      const slug = resolveMetroSlugForSale(row, metros, anchors)
      if (!slug) continue
      countsBySlug[slug] = (countsBySlug[slug] ?? 0) + 1
    }
  }

  return countsBySlug
}

/** Map pins for metro market weekend inventory (same geography as counts). */
export async function fetchWeekendMapInventoryForMetro(
  metro: SeoMetro,
  metros: SeoMetro[],
  now: Date = new Date(),
  anchorsBySlug?: Record<string, MetroMarketAnchor | null>
): Promise<MetroWeekendMapInventory> {
  const anchors = anchorsBySlug ?? buildMetroMarketAnchorsBySlug(metros)
  const anchor = anchors[metro.slug]
  const weekend = getThisWeekendWindowInMetro(metro.timezone, now)

  if (!anchor) {
    return { pins: [], pinsBeforeCap: 0, mapFitBounds: null }
  }

  const marketBounds = buildMarketBoundsAroundAnchor(anchor)
  const rows = await fetchGeoRowsInBbox({ bounds: marketBounds, now })
  const qualifyingPins: SocialCityReportMapPin[] = []

  for (const row of rows) {
    if (!saleOverlapsDateRange(row, weekend.start, weekend.end)) continue
    if (typeof row.lat !== 'number' || typeof row.lng !== 'number') continue
    if (resolveMetroSlugForSale(row, metros, anchors) !== metro.slug) continue
    qualifyingPins.push({
      id: row.id,
      lat: row.lat,
      lng: row.lng,
      title: row.title?.trim() || 'Sale',
      is_featured: row.is_featured === true,
    })
  }

  qualifyingPins.sort((a, b) => a.id.localeCompare(b.id))

  const mapFitBounds = marketBounds

  return {
    pins: qualifyingPins.slice(0, SOCIAL_REPORT_MAP_PIN_LIMIT),
    pinsBeforeCap: qualifyingPins.length,
    mapFitBounds,
  }
}

/** @deprecated use fetchWeekendMapInventoryForMetro */
export async function fetchWeekendMapPinsForMetro(
  metro: SeoMetro,
  now: Date = new Date()
): Promise<SocialCityReportMapPin[]> {
  const metros = [metro]
  const { pins } = await fetchWeekendMapInventoryForMetro(metro, metros, now)
  return pins
}
