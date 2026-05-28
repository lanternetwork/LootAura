import type { MetadataRoute } from 'next'
import { getSeoBaseUrl } from '@/lib/seo/constants'

/** Core crawlable static routes — never include query-parameter or map-state URLs. */
export function buildStaticSitemapEntries(): MetadataRoute.Sitemap {
  const baseUrl = getSeoBaseUrl()
  const now = new Date()

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sales`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
  ]
}
