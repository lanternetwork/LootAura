import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { T } from '@/lib/supabase/tables'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { isPostgrestMissingModerationStatusColumn } from '@/lib/sales/isPostgrestMissingModerationStatusColumn'
import { getThisWeekendWindowInMetro, saleOverlapsDateRange } from '@/lib/seo/weekendBoundaries'
import {
  buildViewportBoundsFromCenterZoom,
  type ViewportBounds,
} from '@/lib/admin/social/buildViewportBoundsFromCenterZoom'
import {
  SOCIAL_REPORT_VIEWPORT_PRESETS,
  type SocialReportViewportPreset,
} from '@/lib/admin/social/socialReportViewportPresets'
import { countEstateSalesFromTitles } from '@/lib/admin/social/isEstateSaleTitle'
import type { SocialCityReportMapPin } from '@/lib/admin/social/socialCityReportTypes'

const PAGE_SIZE = 1000

type SaleGeoRow = {
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

export type ViewportWeekendInventory = {
  pins: SocialCityReportMapPin[]
  activeSales: number
  estateSales: number
  yardSales: number
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

async function fetchGeoRowsInBbox(options: {
  bounds: ViewportBounds
  now: Date
}): Promise<MapPinRow[]> {
  const admin = getAdminDb()
  const rows: MapPinRow[] = []

  const fetchChunk = async (includeModeration: boolean) => {
    let offset = 0
    for (;;) {
      const { data, error } = await applyPhase4PublicPublishedSaleReadFilters(
        fromBase(admin, T.sales)
          .select('id, lat, lng, title, is_featured, date_start, date_end')
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

function rowsToViewportInventory(
  rows: MapPinRow[],
  weekendStart: string,
  weekendEnd: string
): ViewportWeekendInventory {
  const pins: SocialCityReportMapPin[] = []

  for (const row of rows) {
    if (!saleOverlapsDateRange(row, weekendStart, weekendEnd)) continue
    if (typeof row.lat !== 'number' || typeof row.lng !== 'number') continue
    pins.push({
      id: row.id,
      lat: row.lat,
      lng: row.lng,
      title: row.title?.trim() || 'Sale',
      is_featured: row.is_featured === true,
    })
  }

  pins.sort((a, b) => a.id.localeCompare(b.id))

  const estateSales = countEstateSalesFromTitles(pins.map((pin) => pin.title))
  const activeSales = pins.length

  return {
    pins,
    activeSales,
    estateSales,
    yardSales: activeSales - estateSales,
  }
}

/** Weekend sales with coordinates inside viewport bounds (viewport is the inventory gate). */
export async function fetchWeekendSalesInViewport(
  viewport: { bounds: ViewportBounds; timezone: string },
  now: Date = new Date()
): Promise<ViewportWeekendInventory> {
  const weekend = getThisWeekendWindowInMetro(viewport.timezone, now)
  const rows = await fetchGeoRowsInBbox({ bounds: viewport.bounds, now })
  return rowsToViewportInventory(rows, weekend.start, weekend.end)
}

function presetToViewportBounds(preset: SocialReportViewportPreset): ViewportBounds {
  return buildViewportBoundsFromCenterZoom({
    centerLat: preset.centerLat,
    centerLng: preset.centerLng,
    zoom: preset.zoom,
  })
}

/** Viewport-bounded weekend counts for ranking preset cities only. */
export async function fetchPresetViewportWeekendCountsBySlug(
  now: Date = new Date()
): Promise<Record<string, number>> {
  const countsBySlug: Record<string, number> = {}

  for (const preset of SOCIAL_REPORT_VIEWPORT_PRESETS) {
    const { activeSales } = await fetchWeekendSalesInViewport(
      {
        bounds: presetToViewportBounds(preset),
        timezone: preset.timezone,
      },
      now
    )
    countsBySlug[preset.citySlug] = activeSales
  }

  return countsBySlug
}
