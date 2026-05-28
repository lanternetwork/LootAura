import type { MetadataRoute } from 'next'
import { getWeekendPageCanonicalUrl } from '@/lib/seo/canonical'
import { getSeoActiveMetros } from '@/lib/seo/metroCatalog'
import { qualifyAllSeoMetros } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary } from '@/lib/seo/types'

/**
 * Weekend sitemap entries — gated identically to city surfaces.
 */
export function buildWeekendSitemapEntries(options: {
  nationalIndexingAllowed: boolean
  inventoryBySlug: Record<string, SeoInventorySummary>
}): MetadataRoute.Sitemap {
  if (!options.nationalIndexingAllowed) return []

  const qualified = qualifyAllSeoMetros({
    metros: getSeoActiveMetros(),
    nationalIndexingAllowed: true,
    inventoryBySlug: options.inventoryBySlug,
  }).filter((m) => m.qualified)

  const now = new Date()
  return qualified.map((m) => ({
    url: getWeekendPageCanonicalUrl(m.slug),
    lastModified: now,
    changeFrequency: 'hourly' as const,
    priority: 0.8,
  }))
}
