import {
  getCityPagePath,
  getListingCanonicalPath,
  getWeekendPagePath,
} from '@/lib/seo/canonical'
import { buildMetroSlug } from '@/lib/seo/pilotMetros'
import { getSeoActiveMetros, getSeoMetroBySlug } from '@/lib/seo/metroCatalog'
import type { SeoPilotMetro } from '@/lib/seo/types'
import type { Sale } from '@/lib/types'

export type SeoGeoLink = {
  href: string
  label: string
}

export type ListingGeoLinks = {
  metro: SeoPilotMetro | null
  city: SeoGeoLink | null
  weekend: SeoGeoLink | null
  nearbyMetros: SeoGeoLink[]
}

export type MetroGeoLinks = {
  city: SeoGeoLink
  weekend: SeoGeoLink
  nearbyMetros: SeoGeoLink[]
}

function normalizeCity(city: string): string {
  return city.trim().toLowerCase()
}

function normalizeState(state: string): string {
  return state.trim().toUpperCase()
}

/**
 * Resolve a pilot metro for a sale when city/state match a configured slug.
 */
export function resolvePilotMetroForSale(sale: {
  city?: string | null
  state?: string | null
}): SeoPilotMetro | null {
  return resolveSeoMetroForSale(sale)
}

export function resolveSeoMetroForSale(sale: {
  city?: string | null
  state?: string | null
}): SeoPilotMetro | null {
  if (!sale.city?.trim() || !sale.state?.trim()) return null
  const city = normalizeCity(sale.city)
  const state = normalizeState(sale.state)
  const slug = buildMetroSlug(sale.city, sale.state)
  const bySlug = getSeoMetroBySlug(slug)
  if (bySlug && getSeoActiveMetros().some((m) => m.slug === bySlug.slug)) {
    return bySlug
  }
  return (
    getSeoActiveMetros().find(
      (m) => normalizeCity(m.city) === city && normalizeState(m.state) === state
    ) ?? null
  )
}

export function getNearbyPilotMetros(metro: SeoPilotMetro, limit = 4): SeoPilotMetro[] {
  return getSeoActiveMetros().filter((m) => m.slug !== metro.slug)
    .sort((a, b) => {
      const aSameState = a.state === metro.state ? 0 : 1
      const bSameState = b.state === metro.state ? 0 : 1
      if (aSameState !== bSameState) return aSameState - bSameState
      return a.city.localeCompare(b.city)
    })
    .slice(0, limit)
}

export function buildListingGeoLinks(sale: Sale): ListingGeoLinks {
  const metro = resolvePilotMetroForSale(sale)
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
    nearbyMetros: getNearbyPilotMetros(metro).map((m) => ({
      href: getCityPagePath(m.slug),
      label: `${m.city}, ${m.state}`,
    })),
  }
}

export function buildMetroGeoLinks(metro: SeoPilotMetro): MetroGeoLinks {
  return {
    city: {
      href: getCityPagePath(metro.slug),
      label: `All yard sales in ${metro.city}`,
    },
    weekend: {
      href: getWeekendPagePath(metro.slug),
      label: `This weekend in ${metro.city}`,
    },
    nearbyMetros: getNearbyPilotMetros(metro).map((m) => ({
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
