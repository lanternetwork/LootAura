import {
  SEO_LISTING_PATH_PREFIX,
  SEO_METRO_INVENTORY_PATH_PREFIX,
  SEO_WEEKEND_PATH_PREFIX,
  getSeoBaseUrl,
} from '@/lib/seo/constants'
import type { SeoMetroSlug } from '@/lib/seo/types'

/**
 * Canonical listing path — sale id is the only stable public identity.
 * Optional slug URLs (Phase 2+) must redirect here and never define identity.
 */
export function getListingCanonicalPath(saleId: string): string {
  return `${SEO_LISTING_PATH_PREFIX}/${saleId}`
}

export function getListingCanonicalUrl(saleId: string): string {
  return `${getSeoBaseUrl()}${getListingCanonicalPath(saleId)}`
}

/** Single canonical metro inventory surface (category-specific surfaces deferred). */
export function getCityPagePath(metroSlug: SeoMetroSlug): string {
  return `${SEO_METRO_INVENTORY_PATH_PREFIX}/${metroSlug}`
}

export function getCityPageCanonicalUrl(metroSlug: SeoMetroSlug): string {
  return `${getSeoBaseUrl()}${getCityPagePath(metroSlug)}`
}

export function getWeekendPagePath(metroSlug: SeoMetroSlug): string {
  return `${SEO_WEEKEND_PATH_PREFIX}/${metroSlug}`
}

export function getWeekendPageCanonicalUrl(metroSlug: SeoMetroSlug): string {
  return `${getSeoBaseUrl()}${getWeekendPagePath(metroSlug)}`
}

/**
 * Presentation-only slug path — must 301/308 to canonical sale id URL when used.
 */
export function getListingPresentationSlugPath(_slug: string, saleId: string): string {
  return getListingCanonicalPath(saleId)
}
