import type { MetadataRoute } from 'next'
import { getWeekendPageCanonicalUrl } from '@/lib/seo/canonical'
import { qualifyAllPilotMetros } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary } from '@/lib/seo/types'

/**
 * Weekend sitemap entries — gated identically to city surfaces.
 */
export function buildWeekendSitemapEntries(options: {
  nationalIndexingAllowed: boolean
  inventoryBySlug: Record<string, SeoInventorySummary>
}): MetadataRoute.Sitemap {
  if (!options.nationalIndexingAllowed) return []

  const qualified = qualifyAllPilotMetros({
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
