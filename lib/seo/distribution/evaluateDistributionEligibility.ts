import { qualifyMetroForSeoRollout } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'

export type SeoDistributionEligibility = {
  eligible: boolean
  blockers: string[]
  score: number
}

/**
 * Phase 7 — same inventory/ops gates as SEO surfaces; human posts only when qualified.
 */
export function evaluateDistributionEligibility(options: {
  metro: SeoMetro
  inventory: SeoInventorySummary
  nationalIndexingAllowed: boolean
}): SeoDistributionEligibility {
  const qualification = qualifyMetroForSeoRollout({
    metro: options.metro,
    inventory: options.inventory,
    nationalIndexingAllowed: options.nationalIndexingAllowed,
  })

  return {
    eligible: qualification.qualified,
    blockers: qualification.qualified ? [] : qualification.reasons,
    score: qualification.score,
  }
}
