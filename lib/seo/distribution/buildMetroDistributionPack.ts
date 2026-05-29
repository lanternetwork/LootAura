import { getCityPagePath, getWeekendPagePath } from '@/lib/seo/canonical'
import { formatFreshnessLabel } from '@/lib/seo/copy/cityPageCopy'
import { buildWeekendDateRangeLabel } from '@/lib/seo/copy/weekendPageCopy'
import { buildSeoDistributionUrl } from '@/lib/seo/distribution/buildDistributionUrls'
import { evaluateDistributionEligibility } from '@/lib/seo/distribution/evaluateDistributionEligibility'
import { isWeekendDistributionSurface } from '@/lib/seo/distribution/surfaces'
import type { SeoDistributionPack, SeoDistributionSurfaceId } from '@/lib/seo/distribution/types'
import { SEO_SITE_NAME } from '@/lib/seo/constants'
import type { SeoInventorySummary, SeoPilotMetro } from '@/lib/seo/types'
import type { MetroWeekendWindow } from '@/lib/seo/weekendBoundaries'

function sampleListingLines(
  sales: Array<{ title?: string | null; city?: string | null; state?: string | null }>,
  limit: number
): string[] {
  return sales.slice(0, limit).map((sale, index) => {
    const title = sale.title?.trim() || `Sale ${index + 1}`
    const place =
      sale.city && sale.state ? ` — ${sale.city}, ${sale.state}` : ''
    return `• ${title}${place}`
  })
}

function formatPackBody(options: {
  surface: SeoDistributionSurfaceId
  metro: SeoPilotMetro
  inventory: SeoInventorySummary
  weekend?: MetroWeekendWindow
  cityUrl: string
  weekendUrl: string
  listingLines: string[]
}): { title: string; body: string } {
  const { surface, metro, inventory, weekend, cityUrl, weekendUrl, listingLines } = options
  const freshness = formatFreshnessLabel(inventory.lastUpdatedAt)
  const count = inventory.activeListingCount
  const place = `${metro.city}, ${metro.state}`
  const weekendLabel = weekend ? buildWeekendDateRangeLabel(weekend) : 'this weekend'

  const isReddit = surface.startsWith('reddit_')
  const isEmail = surface === 'digest_email'

  const title =
    surface === 'reddit_weekend' || surface === 'facebook_weekend'
      ? `Yard sales ${weekendLabel} in ${place} (${count} on ${SEO_SITE_NAME})`
      : `Yard sales in ${place} (${count} active on ${SEO_SITE_NAME})`

  const intro =
    surface === 'reddit_weekend' || surface === 'facebook_weekend'
      ? `${count} yard sales, garage sales, and estate sales are active ${weekendLabel} in ${place}. Inventory uses the ${metro.timezone} metro window.`
      : `${count} active yard sales, garage sales, and estate sales in ${place} right now on ${SEO_SITE_NAME}.`

  const linkBlock = [
    `All ${metro.city} listings: ${cityUrl}`,
    `This weekend in ${metro.city}: ${weekendUrl}`,
  ].join('\n')

  const samples =
    listingLines.length > 0
      ? ['Sample listings:', ...listingLines].join('\n')
      : ''

  const footer =
    'Human-reviewed local inventory summary from live marketplace data — paste manually; not automated posting.'

  const parts = [intro, `Freshness: ${freshness}.`, linkBlock]
  if (samples) parts.push(samples)
  parts.push(footer)

  if (isReddit) {
    return {
      title,
      body: `**${title}**\n\n${parts.join('\n\n')}`,
    }
  }

  if (isEmail) {
    return {
      title: `${SEO_SITE_NAME} — ${place} yard sale digest`,
      body: [`# ${title}`, '', ...parts].join('\n'),
    }
  }

  return { title, body: parts.join('\n\n') }
}

export function buildMetroDistributionPack(options: {
  metro: SeoPilotMetro
  surface: SeoDistributionSurfaceId
  inventory: SeoInventorySummary
  nationalIndexingAllowed: boolean
  weekend?: MetroWeekendWindow
  sampleSales?: Array<{ title?: string | null; city?: string | null; state?: string | null }>
}): SeoDistributionPack {
  const eligibility = evaluateDistributionEligibility({
    metro: options.metro,
    inventory: options.inventory,
    nationalIndexingAllowed: options.nationalIndexingAllowed,
  })

  const cityUrl = buildSeoDistributionUrl(getCityPagePath(options.metro.slug), options.surface)
  const weekendUrl = buildSeoDistributionUrl(
    getWeekendPagePath(options.metro.slug),
    options.surface
  )

  const links = [
    { label: `${options.metro.city} inventory`, url: cityUrl },
    { label: `${options.metro.city} this weekend`, url: weekendUrl },
  ]

  if (!eligibility.eligible) {
    return {
      generatedAt: new Date().toISOString(),
      metroSlug: options.metro.slug,
      surface: options.surface,
      eligible: false,
      blockers: eligibility.blockers,
      title: '',
      body: '',
      links,
    }
  }

  if (isWeekendDistributionSurface(options.surface) && options.inventory.activeListingCount === 0) {
    return {
      generatedAt: new Date().toISOString(),
      metroSlug: options.metro.slug,
      surface: options.surface,
      eligible: false,
      blockers: ['No weekend inventory in metro window'],
      title: '',
      body: '',
      links,
    }
  }

  const listingLines = sampleListingLines(options.sampleSales ?? [], 5)
  const { title, body } = formatPackBody({
    surface: options.surface,
    metro: options.metro,
    inventory: options.inventory,
    weekend: options.weekend,
    cityUrl,
    weekendUrl,
    listingLines,
  })

  return {
    generatedAt: new Date().toISOString(),
    metroSlug: options.metro.slug,
    surface: options.surface,
    eligible: true,
    blockers: [],
    title,
    body,
    links,
  }
}
