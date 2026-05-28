import type { MetadataRoute } from 'next'
import { getCityPageCanonicalUrl } from '@/lib/seo/canonical'
import { getSeoActiveMetros } from '@/lib/seo/metroCatalog'
import { qualifyAllSeoMetros } from '@/lib/seo/metroQualification'
import type { SeoInventorySummary } from '@/lib/seo/types'

/**
 * City sitemap entries — only qualified pilot metros when national allowlist passes.
 * Phase 2 implements pages; Phase 1 provides gated sitemap plumbing.
 */
export function buildCitySitemapEntries(options: {
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
    url: getCityPageCanonicalUrl(m.slug),
    lastModified: now,
    changeFrequency: 'hourly' as const,
    priority: 0.85,
  }))
}
