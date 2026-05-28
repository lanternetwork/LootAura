import type { Sale } from '@/lib/types'
import {
  createBreadcrumbStructuredData,
  createSaleEventStructuredData,
} from '@/lib/metadata'
import {
  getCityPageCanonicalUrl,
  getListingCanonicalUrl,
  getWeekendPageCanonicalUrl,
} from '@/lib/seo/canonical'
import { getSeoBaseUrl } from '@/lib/seo/constants'
import type { SeoInventorySummary, SeoMetroSlug, SeoPilotMetro } from '@/lib/seo/types'

export { createSaleEventStructuredData, createBreadcrumbStructuredData }

export type InventoryListItem = {
  saleId: string
  title: string
  url: string
  dateStart?: string | null
  dateEnd?: string | null
  city?: string | null
  state?: string | null
  imageUrl?: string | null
}

export function createInventoryItemListStructuredData(options: {
  name: string
  description: string
  items: InventoryListItem[]
  pageUrl: string
}) {
  const { name, description, items, pageUrl } = options
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    description,
    url: pageUrl,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url,
      item: {
        '@type': 'Event',
        name: item.title,
        startDate: item.dateStart ? `${item.dateStart}T00:00:00` : undefined,
        endDate: item.dateEnd ? `${item.dateEnd}T23:59:59` : undefined,
        url: item.url,
        ...(item.imageUrl ? { image: item.imageUrl } : {}),
        location: {
          '@type': 'Place',
          address: {
            '@type': 'PostalAddress',
            addressLocality: item.city ?? undefined,
            addressRegion: item.state ?? undefined,
            addressCountry: 'US',
          },
        },
      },
    })),
  }
}

export function createMetroPlaceStructuredData(metro: SeoPilotMetro) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: `${metro.city}, ${metro.state}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: metro.city,
      addressRegion: metro.state,
      addressCountry: 'US',
    },
  }
}

export function createCityPageStructuredDataBundle(options: {
  metro: SeoPilotMetro
  inventory: SeoInventorySummary
  items: InventoryListItem[]
}) {
  const { metro, inventory, items } = options
  const pageUrl = getCityPageCanonicalUrl(metro.slug as SeoMetroSlug)
  const listName = `Yard sales in ${metro.city}, ${metro.state}`

  return [
    createMetroPlaceStructuredData(metro),
    createInventoryItemListStructuredData({
      name: listName,
      description: `${inventory.activeListingCount} active yard sales and estate sales in ${metro.city}, ${metro.state}.`,
      items,
      pageUrl,
    }),
    createBreadcrumbStructuredData([
      { name: 'Home', url: '/' },
      { name: metro.city, url: getCityPageCanonicalUrl(metro.slug as SeoMetroSlug).replace(getSeoBaseUrl(), '') },
    ]),
  ]
}

export function createWeekendPageStructuredDataBundle(options: {
  metro: SeoPilotMetro
  inventory: SeoInventorySummary
  items: InventoryListItem[]
  weekendLabel?: string
}) {
  const { metro, inventory, items } = options
  const weekendLabel = options.weekendLabel ?? 'This Weekend'
  const pageUrl = getWeekendPageCanonicalUrl(metro.slug as SeoMetroSlug)
  const listName = `Yard sales ${weekendLabel} in ${metro.city}, ${metro.state}`

  return [
    createMetroPlaceStructuredData(metro),
    createInventoryItemListStructuredData({
      name: listName,
      description: `${inventory.activeListingCount} yard sales ${weekendLabel.toLowerCase()} in ${metro.city}, ${metro.state}.`,
      items,
      pageUrl,
    }),
    createBreadcrumbStructuredData([
      { name: 'Home', url: '/' },
      {
        name: metro.city,
        url: getCityPageCanonicalUrl(metro.slug as SeoMetroSlug).replace(getSeoBaseUrl(), ''),
      },
      {
        name: weekendLabel,
        url: getWeekendPageCanonicalUrl(metro.slug as SeoMetroSlug).replace(getSeoBaseUrl(), ''),
      },
    ]),
  ]
}

export function createListingPageStructuredDataBundle(sale: Sale) {
  return [
    createSaleEventStructuredData(sale),
    createBreadcrumbStructuredData([
      { name: 'Home', url: '/' },
      { name: 'Sales', url: '/sales' },
      { name: sale.title || 'Sale', url: getListingCanonicalUrl(sale.id).replace(getSeoBaseUrl(), '') },
    ]),
  ]
}

export function saleToInventoryListItem(sale: Sale): InventoryListItem {
  const cover =
    sale.cover_image_url ||
    (Array.isArray(sale.images) && sale.images.length > 0 ? sale.images[0] : null)
  return {
    saleId: sale.id,
    title: sale.title || 'Yard Sale',
    url: getListingCanonicalUrl(sale.id),
    dateStart: sale.date_start,
    dateEnd: sale.date_end,
    city: sale.city,
    state: sale.state,
    imageUrl: typeof cover === 'string' ? cover : null,
  }
}
