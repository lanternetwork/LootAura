import type { SeoInventorySummary, SeoPilotMetro } from '@/lib/seo/types'

export function buildCityPageH1(
  metro: SeoPilotMetro,
  inventory: SeoInventorySummary,
  weekendLabel = 'This Weekend',
  options?: { stableTitleWhenEmpty?: boolean }
): string {
  if (options?.stableTitleWhenEmpty && inventory.activeListingCount === 0) {
    return `${metro.city} Yard Sales`
  }
  return `${inventory.activeListingCount} Yard Sales ${weekendLabel} in ${metro.city}, ${metro.state}`
}

export function buildCityPageEmptyInventoryMessage(): string {
  return [
    'No active yard sales found today.',
    'Many yard sales happen Friday through Sunday.',
    'Check back this weekend.',
  ].join('\n\n')
}

export function buildCityPageSupportingCopy(options: {
  metro: SeoPilotMetro
  inventory: SeoInventorySummary
  nearbyMetros: SeoPilotMetro[]
}): string {
  const { metro, inventory, nearbyMetros } = options
  const crawlPct = Math.round(inventory.crawlableInventoryPct * 100)
  const freshness = inventory.lastUpdatedAt
    ? `Inventory was last updated ${new Date(inventory.lastUpdatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`
    : 'Inventory updates as new sales are published in this area.'

  const nearby =
    nearbyMetros.length > 0
      ? `Nearby markets with active listings include ${nearbyMetros.map((m) => `${m.city}, ${m.state}`).join(', ')}.`
      : ''

  return [
    `Loot Aura lists ${inventory.activeListingCount} active yard sales, garage sales, and estate sales in ${metro.city}, ${metro.state}.`,
    freshness,
    `${crawlPct}% of current listings include map-ready locations for local discovery.`,
    `Browse sale dates, addresses, and photos below — then open any listing for full details.`,
    nearby,
    `For time-sensitive weekend planning, use the this-weekend link above when weekend inventory is available.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function formatFreshnessLabel(lastUpdatedAt: string | null): string {
  if (!lastUpdatedAt) return 'Updating local inventory'
  const updated = new Date(lastUpdatedAt)
  const hours = Math.round((Date.now() - updated.getTime()) / (1000 * 60 * 60))
  if (hours < 1) return 'Updated within the last hour'
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`
  return `Updated ${updated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
