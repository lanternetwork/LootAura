import type {
  SeoInventorySummary,
  SeoMetro,
  SeoMetroQualificationInput,
  SeoMetroQualificationResult,
} from '@/lib/seo/types'

const CRAWLABLE_INVENTORY_MIN_PCT = 0.85

/**
 * Metro qualification — operational scoring only (inventory + national gates).
 * No pilot/expansion allowlists.
 */
export function qualifyMetroForSeoRollout(input: SeoMetroQualificationInput): SeoMetroQualificationResult {
  const { metro, inventory, nationalIndexingAllowed } = input
  const reasons: string[] = []
  let score = 0

  if (!nationalIndexingAllowed) {
    reasons.push('National SEO operational gates have not passed')
  } else {
    score += 40
  }

  if (inventory.activeListingCount >= metro.minActiveListings) {
    score += 30
  } else {
    reasons.push(
      `Active listings ${inventory.activeListingCount} below minimum ${metro.minActiveListings}`
    )
  }

  if (inventory.crawlableInventoryPct >= CRAWLABLE_INVENTORY_MIN_PCT) {
    score += 20
  } else {
    reasons.push(
      `Crawlable inventory ${(inventory.crawlableInventoryPct * 100).toFixed(0)}% below ${CRAWLABLE_INVENTORY_MIN_PCT * 100}%`
    )
  }

  if (inventory.lastUpdatedAt) {
    score += 10
  } else {
    reasons.push('No freshness timestamp for metro inventory')
  }

  const qualified = reasons.length === 0 && score >= 90

  return {
    slug: metro.slug,
    qualified,
    score,
    reasons,
  }
}

export function qualifyAllSeoMetros(options: {
  metros: SeoMetro[]
  nationalIndexingAllowed: boolean
  inventoryBySlug: Record<string, SeoInventorySummary>
}): SeoMetroQualificationResult[] {
  return options.metros.map((metro) =>
    qualifyMetroForSeoRollout({
      metro,
      nationalIndexingAllowed: options.nationalIndexingAllowed,
      inventory: options.inventoryBySlug[metro.slug] ?? {
        activeListingCount: 0,
        lastUpdatedAt: null,
        crawlableInventoryPct: 0,
      },
    })
  )
}
