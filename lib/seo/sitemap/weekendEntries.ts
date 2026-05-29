import type { MetadataRoute } from 'next'
import { getWeekendPageCanonicalUrl } from '@/lib/seo/canonical'
import { qualifyAllSeoMetros } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'

/**
 * Weekend sitemap entries — nationwide metros that pass operational qualification.
 */
export function buildWeekendSitemapEntries(options: {
  metros: SeoMetro[]
  nationalIndexingAllowed: boolean
  inventoryBySlug: Record<string, SeoInventorySummary>
}): MetadataRoute.Sitemap {
  if (!options.nationalIndexingAllowed) return []

  const qualified = qualifyAllSeoMetros({
    metros: options.metros,
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
