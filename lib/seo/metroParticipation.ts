import { qualifyMetroForSeoRollout } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary, SeoMetro, SeoMetroQualificationResult } from '@/lib/seo/types'

export type SeoMetroParticipationRow = SeoMetroQualificationResult & {
  metro: SeoMetro
  inventory: SeoInventorySummary
}

export type SeoMetroParticipationSnapshot = {
  generatedAt: string
  participatingMetroSlugs: string[]
  rows: SeoMetroParticipationRow[]
}

/**
 * Nationwide metro participation — all discovered metros scored against operational gates only.
 */
export function evaluateSeoMetroParticipation(options: {
  metros: SeoMetro[]
  nationalIndexingAllowed: boolean
  inventoryBySlug: Record<string, SeoInventorySummary>
}): SeoMetroParticipationSnapshot {
  const rows: SeoMetroParticipationRow[] = options.metros.map((metro) => {
    const inventory = options.inventoryBySlug[metro.slug] ?? {
      activeListingCount: 0,
      lastUpdatedAt: null,
      crawlableInventoryPct: 0,
    }
    const qualification = qualifyMetroForSeoRollout({
      metro,
      inventory,
      nationalIndexingAllowed: options.nationalIndexingAllowed,
    })
    return {
      ...qualification,
      metro,
      inventory,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    participatingMetroSlugs: rows.filter((r) => r.qualified).map((r) => r.slug),
    rows,
  }
}
