import { getSeoActiveMetros, getSeoMetroCatalogForDashboard, isSeoMetroActive, isSeoPilotMetro } from '@/lib/seo/metroCatalog'
import { qualifyMetroForSeoRollout } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary, SeoMetroQualificationResult, SeoPilotMetro } from '@/lib/seo/types'

export type SeoMetroExpansionTier = 'pilot' | 'expansion_candidate' | 'expansion_active'

export type SeoMetroExpansionRow = SeoMetroQualificationResult & {
  metro: SeoPilotMetro
  tier: SeoMetroExpansionTier
  pageActive: boolean
  inventory: SeoInventorySummary
}

export type SeoMetroExpansionSnapshot = {
  generatedAt: string
  activeMetroSlugs: string[]
  rows: SeoMetroExpansionRow[]
}

function tierForMetro(slug: string): SeoMetroExpansionTier {
  if (isSeoPilotMetro(slug)) return 'pilot'
  if (isSeoMetroActive(slug)) return 'expansion_active'
  return 'expansion_candidate'
}

export function evaluateSeoMetroExpansion(options: {
  nationalIndexingAllowed: boolean
  inventoryBySlug: Record<string, SeoInventorySummary>
}): SeoMetroExpansionSnapshot {
  const catalog = getSeoMetroCatalogForDashboard()
  const rows: SeoMetroExpansionRow[] = catalog.map((metro) => {
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
      tier: tierForMetro(metro.slug),
      pageActive: isSeoMetroActive(metro.slug),
      inventory,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    activeMetroSlugs: getSeoActiveMetros().map((m) => m.slug),
    rows,
  }
}
