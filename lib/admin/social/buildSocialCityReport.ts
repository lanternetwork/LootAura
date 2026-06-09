import {
  discoverSeoMetrosFromPublishedSales,
  getSeoMetroBySlug,
} from '@/lib/seo/metroCatalog'
import { getThisWeekendWindowInMetro } from '@/lib/seo/weekendBoundaries'
import { buildSocialCityReportCaption } from '@/lib/admin/social/buildSocialCityReportCaption'
import { computeCityRankAmongPresets } from '@/lib/admin/social/computeCityRank'
import {
  formatSocialReportTimestamp,
  formatWeekendHeroDateRange,
} from '@/lib/admin/social/formatSocialReportDisplay'
import { resolveSocialReportViewportForMetro } from '@/lib/admin/social/resolveSocialReportViewport'
import type { SocialReportFormatSlug } from '@/lib/admin/social/socialReportFormats'
import { listSocialReportRankingPresetSlugs } from '@/lib/admin/social/socialReportViewportPresets'
import type { SocialCityReport, SocialMetroOption } from '@/lib/admin/social/socialCityReportTypes'
import {
  fetchPresetViewportWeekendCountsBySlug,
  fetchWeekendSalesInViewport,
} from '@/lib/admin/social/weekendInventoryQuery'

export function formatSocialMetroLabel(city: string, state: string): string {
  return `${city}, ${state}`
}

export function buildSocialMetroOptions(
  metros: Awaited<ReturnType<typeof discoverSeoMetrosFromPublishedSales>>
): SocialMetroOption[] {
  return metros
    .map((metro) => ({
      slug: metro.slug,
      city: metro.city,
      state: metro.state,
      label: formatSocialMetroLabel(metro.city, metro.state),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export async function buildSocialCityReport(
  citySlug: string,
  format: SocialReportFormatSlug,
  now: Date = new Date()
): Promise<SocialCityReport> {
  const normalizedSlug = citySlug.trim().toLowerCase()
  if (!normalizedSlug) {
    throw new SocialCityReportError('CITY_SLUG_REQUIRED', 'citySlug is required', 400)
  }

  const metros = await discoverSeoMetrosFromPublishedSales()
  const metro = getSeoMetroBySlug(metros, normalizedSlug)
  if (!metro) {
    throw new SocialCityReportError(
      'METRO_NOT_FOUND',
      `No metro catalog entry for slug "${normalizedSlug}"`,
      404
    )
  }

  const viewport = resolveSocialReportViewportForMetro(metro, format)
  const [inventory, presetCounts] = await Promise.all([
    fetchWeekendSalesInViewport(
      { bounds: viewport.bounds, timezone: viewport.timezone },
      now
    ),
    fetchPresetViewportWeekendCountsBySlug(format, now),
  ])

  const cityRank = viewport.isRankingPreset
    ? computeCityRankAmongPresets(
        listSocialReportRankingPresetSlugs(),
        presetCounts,
        metro.slug
      )
    : null

  const weekend = getThisWeekendWindowInMetro(viewport.timezone, now)
  const updatedAt = now.toISOString()

  return {
    format,
    city: metro.city,
    state: metro.state,
    citySlug: metro.slug,
    activeSales: inventory.activeSales,
    estateSales: inventory.estateSales,
    yardSales: inventory.yardSales,
    cityRank,
    updatedAt,
    weekendStart: weekend.start,
    weekendEnd: weekend.end,
    weekendLabel: weekend.label,
    heroDateRange: formatWeekendHeroDateRange(weekend, viewport.timezone),
    timestampLabel: formatSocialReportTimestamp(now, viewport.timezone),
    caption: buildSocialCityReportCaption({
      city: metro.city,
      state: metro.state,
      cityRank,
      activeSales: inventory.activeSales,
    }),
    mapPins: inventory.pins,
    mapViewport: {
      centerLat: viewport.centerLat,
      centerLng: viewport.centerLng,
      zoom: viewport.zoom,
    },
  }
}

export class SocialCityReportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'SocialCityReportError'
  }
}
