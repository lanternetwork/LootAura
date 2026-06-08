import {
  discoverSeoMetrosFromPublishedSales,
  getSeoMetroBySlug,
} from '@/lib/seo/metroCatalog'
import { getThisWeekendWindowInMetro } from '@/lib/seo/weekendBoundaries'
import { buildSocialCityReportCaption } from '@/lib/admin/social/buildSocialCityReportCaption'
import { computeCityRankBySlug } from '@/lib/admin/social/computeCityRank'
import {
  formatSocialReportTimestamp,
  formatWeekendHeroDateRange,
} from '@/lib/admin/social/formatSocialReportDisplay'
import type { SocialCityReport, SocialMetroOption } from '@/lib/admin/social/socialCityReportTypes'
import { buildMetroMarketAnchorsBySlug } from '@/lib/admin/social/metroMarketGeography'
import {
  fetchWeekendInventoryCountsBySlug,
  fetchWeekendMapInventoryForMetro,
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

  const anchorsBySlug = buildMetroMarketAnchorsBySlug(metros)
  const [countsBySlug, mapInventory] = await Promise.all([
    fetchWeekendInventoryCountsBySlug(metros, now, anchorsBySlug),
    fetchWeekendMapInventoryForMetro(metro, metros, now, anchorsBySlug),
  ])

  const activeSales = countsBySlug[metro.slug] ?? 0
  const cityRank = computeCityRankBySlug(metros, countsBySlug, metro.slug)
  const weekend = getThisWeekendWindowInMetro(metro.timezone, now)
  const updatedAt = now.toISOString()

  return {
    city: metro.city,
    state: metro.state,
    citySlug: metro.slug,
    activeSales,
    cityRank,
    updatedAt,
    weekendStart: weekend.start,
    weekendEnd: weekend.end,
    weekendLabel: weekend.label,
    heroDateRange: formatWeekendHeroDateRange(weekend, metro.timezone),
    timestampLabel: formatSocialReportTimestamp(now, metro.timezone),
    caption: buildSocialCityReportCaption({
      city: metro.city,
      state: metro.state,
      cityRank,
      activeSales,
    }),
    mapPins: mapInventory.pins,
    mapPinsBeforeCap: mapInventory.pinsBeforeCap,
    mapFitBounds: mapInventory.mapFitBounds,
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
