import type { Metadata } from 'next'
import type { Sale } from '@/lib/types'
import { createSaleMetadata } from '@/lib/metadata'
import {
  getCityPageCanonicalUrl,
  getListingCanonicalUrl,
  getWeekendPageCanonicalUrl,
} from '@/lib/seo/canonical'
import { SEO_SITE_NAME } from '@/lib/seo/constants'
import { createIndexableRobotsMetadata, createNoindexRobotsMetadata } from '@/lib/seo/robots'
import type { SeoInventorySummary, SeoMetroSlug, SeoPilotMetro, SeoRobotsDirective } from '@/lib/seo/types'

function applyRobots(metadata: Metadata, directive: SeoRobotsDirective): Metadata {
  return {
    ...metadata,
    robots: directive.index ? createIndexableRobotsMetadata() : createNoindexRobotsMetadata(),
  }
}

export type SeoCityPageContext = {
  metro: SeoPilotMetro
  inventory: SeoInventorySummary
  robots?: SeoRobotsDirective
}

export type SeoWeekendPageContext = {
  metro: SeoPilotMetro
  inventory: SeoInventorySummary
  /** Human label e.g. "This Weekend" — derived from metro TZ in Phase 3. */
  weekendLabel?: string
  robots?: SeoRobotsDirective
}

/**
 * Listing metadata — canonical URL derives from sale id only (never from slug).
 */
export function createListingSeoMetadata(
  sale: Sale,
  options?: { categories?: string[]; robots?: SeoRobotsDirective }
): Metadata {
  const base = createSaleMetadata(sale, { categories: options?.categories })
  const canonicalUrl = getListingCanonicalUrl(sale.id)
  const robots = options?.robots ?? { index: false, follow: true }

  return applyRobots(
    {
      ...base,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        ...base.openGraph,
        url: canonicalUrl,
      },
    },
    robots
  )
}

export function createCityPageMetadata(ctx: SeoCityPageContext): Metadata {
  const { metro, inventory } = ctx
  const title = `${inventory.activeListingCount} Yard Sales in ${metro.city}, ${metro.state}`
  const description = `Browse ${inventory.activeListingCount} yard sales, garage sales, and estate sales in ${metro.city}, ${metro.state}. Updated local inventory for weekend discovery.`
  const canonicalUrl = getCityPageCanonicalUrl(metro.slug as SeoMetroSlug)
  const robots = ctx.robots ?? { index: false, follow: true }

  const metadata: Metadata = {
    title: `${title} | ${SEO_SITE_NAME}`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonicalUrl,
      siteName: SEO_SITE_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }

  return applyRobots(metadata, robots)
}

export function createWeekendPageMetadata(ctx: SeoWeekendPageContext): Metadata {
  const { metro, inventory } = ctx
  const weekendLabel = ctx.weekendLabel ?? 'This Weekend'
  const title = `${inventory.activeListingCount} Yard Sales ${weekendLabel} in ${metro.city}, ${metro.state}`
  const description = `Find ${inventory.activeListingCount} yard sales and estate sales ${weekendLabel.toLowerCase()} in ${metro.city}, ${metro.state}. Fresh local inventory updated regularly.`
  const canonicalUrl = getWeekendPageCanonicalUrl(metro.slug as SeoMetroSlug)
  const robots = ctx.robots ?? { index: false, follow: true }

  const metadata: Metadata = {
    title: `${title} | ${SEO_SITE_NAME}`,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonicalUrl,
      siteName: SEO_SITE_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }

  return applyRobots(metadata, robots)
}
