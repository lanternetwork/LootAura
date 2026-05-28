import { isSeoMetroActive } from '@/lib/seo/metroCatalog'
import { qualifyMetroForSeoRollout } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary, SeoPilotMetro } from '@/lib/seo/types'

export type SeoDistributionEligibility = {
  eligible: boolean
  blockers: string[]
  score: number
}

/**
 * Phase 7 — same inventory/ops gates as SEO surfaces; human posts only when qualified.
 */
export function evaluateDistributionEligibility(options: {
  metro: SeoPilotMetro
  inventory: SeoInventorySummary
  nationalIndexingAllowed: boolean
}): SeoDistributionEligibility {
  const blockers: string[] = []

  if (!isSeoMetroActive(options.metro.slug)) {
    blockers.push('Metro page is not active (pilot or SEO_EXPANSION_METRO_SLUGS)')
  }

  const qualification = qualifyMetroForSeoRollout({
    metro: options.metro,
    inventory: options.inventory,
    nationalIndexingAllowed: options.nationalIndexingAllowed,
  })

  if (!qualification.qualified) {
    blockers.push(...qualification.reasons)
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    score: qualification.score,
  }
}
