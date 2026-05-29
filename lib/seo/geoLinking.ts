import {
  getCityPagePath,
  getListingCanonicalPath,
  getWeekendPagePath,
} from '@/lib/seo/canonical'
import { getNearbyMetros, resolveSeoMetroForSale } from '@/lib/seo/metroCatalog'
import type { SeoMetro } from '@/lib/seo/types'
import type { Sale } from '@/lib/types'

export type SeoGeoLink = {
  href: string
  label: string
}

export type ListingGeoLinks = {
  metro: SeoMetro | null
  city: SeoGeoLink | null
  weekend: SeoGeoLink | null
  nearbyMetros: SeoGeoLink[]
}

export type MetroGeoLinks = {
  city: SeoGeoLink
  weekend: SeoGeoLink
  nearbyMetros: SeoGeoLink[]
}

/** @deprecated use resolveSeoMetroForSale */
export function resolvePilotMetroForSale(sale: {
  city?: string | null
  state?: string | null
}): SeoMetro | null {
  return resolveSeoMetroForSale(sale)
}

export { resolveSeoMetroForSale } from '@/lib/seo/metroCatalog'

export function getNearbyPilotMetros(metro: SeoMetro, allMetros: SeoMetro[], limit = 4): SeoMetro[] {
  return getNearbyMetros(metro, allMetros, limit)
}

export function buildListingGeoLinks(sale: Sale): ListingGeoLinks {
  const metro = resolveSeoMetroForSale(sale)
  if (!metro) {
    return { metro: null, city: null, weekend: null, nearbyMetros: [] }
  }
  return {
    metro,
    city: {
      href: getCityPagePath(metro.slug),
      label: `Yard sales in ${metro.city}, ${metro.state}`,
    },
    weekend: {
      href: getWeekendPagePath(metro.slug),
      label: `Yard sales this weekend in ${metro.city}`,
    },
    nearbyMetros: [],
  }
}

export function buildMetroGeoLinks(metro: SeoMetro, allMetros: SeoMetro[]): MetroGeoLinks {
  return {
    city: {
      href: getCityPagePath(metro.slug),
      label: `All yard sales in ${metro.city}`,
    },
    weekend: {
      href: getWeekendPagePath(metro.slug),
      label: `This weekend in ${metro.city}`,
    },
    nearbyMetros: getNearbyMetros(metro, allMetros).map((m) => ({
      href: getCityPagePath(m.slug),
      label: `${m.city}, ${m.state}`,
    })),
  }
}

export function buildListingBreadcrumbItems(sale: Sale): Array<{ name: string; url: string }> {
  const items = [
    { name: 'Home', url: '/' },
    { name: 'Sales', url: '/sales' },
  ]
  const geo = buildListingGeoLinks(sale)
  if (geo.city) {
    items.push({ name: geo.metro!.city, url: geo.city.href })
  }
  items.push({ name: sale.title || 'Sale', url: getListingCanonicalPath(sale.id) })
  return items
}

export function buildNearbyListingLinks(
  nearbySales: Array<Sale & { distance_m?: number }>
): SeoGeoLink[] {
  return nearbySales.map((nearby) => ({
    href: getListingCanonicalPath(nearby.id),
    label:
      nearby.title ||
      `Yard sale${nearby.city && nearby.state ? ` in ${nearby.city}, ${nearby.state}` : ''}`,
  }))
}
