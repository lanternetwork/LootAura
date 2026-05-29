import type { SeoInventorySummary, SeoPilotMetro } from '@/lib/seo/types'
import type { MetroWeekendWindow } from '@/lib/seo/weekendBoundaries'
export function buildWeekendPageH1(
  metro: SeoPilotMetro,
  inventory: SeoInventorySummary,
  _weekend: MetroWeekendWindow
): string {
  return `${inventory.activeListingCount} Yard Sales This Weekend in ${metro.city}, ${metro.state}`
}

export function buildWeekendPageSupportingCopy(options: {
  metro: SeoPilotMetro
  inventory: SeoInventorySummary
  weekend: MetroWeekendWindow
}): string {
  const { metro, inventory, weekend } = options
  const freshness = inventory.lastUpdatedAt
    ? `Inventory last changed ${new Date(inventory.lastUpdatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} (${metro.timezone}).`
    : `Inventory updates as listings are published in ${metro.timezone}.`

  return [
    `${inventory.activeListingCount} yard sales, garage sales, and estate sales are active ${weekend.label} in ${metro.city}, ${metro.state}.`,
    `Weekend dates use the ${metro.city} metro timezone (${metro.timezone}), not server or browser time.`,
    freshness,
    `Listings below include titles, dates, addresses, and photos you can open without using the map.`,
    `For all active area inventory, see the ${metro.city} city page.`,
  ].join('\n\n')
}

export function buildWeekendDateRangeLabel(weekend: MetroWeekendWindow): string {
  return weekend.label
}
