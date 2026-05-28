import type {
  SeoInventorySummary,
  SeoMetroQualificationInput,
  SeoMetroQualificationResult,
} from '@/lib/seo/types'
import { SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'

const CRAWLABLE_INVENTORY_MIN_PCT = 0.85

/**
 * Metro qualification matrix — operational scoring before metro enters SEO rollout.
 * National allowlist must pass first; per-metro inventory thresholds apply.
 */
export function qualifyMetroForSeoRollout(input: SeoMetroQualificationInput): SeoMetroQualificationResult {
  const { metro, inventory, nationalIndexingAllowed } = input
  const reasons: string[] = []
  let score = 0

  if (!nationalIndexingAllowed) {
    reasons.push('National SEO index allowlist has not passed')
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

export function qualifyAllPilotMetros(options: {
  nationalIndexingAllowed: boolean
  inventoryBySlug: Record<string, SeoInventorySummary>
}): SeoMetroQualificationResult[] {
  return SEO_PILOT_METROS.map((metro) =>
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
