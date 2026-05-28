import { fetchMetroInventory } from '@/lib/seo/fetchMetroInventory'
import { getSeoMetroCatalogForDashboard } from '@/lib/seo/metroCatalog'
import type { SeoInventorySummary } from '@/lib/seo/types'

/**
 * Live inventory counts for SEO operational dashboard (pilots + expansion candidates).
 */
export async function fetchAllSeoMetroInventory(): Promise<Record<string, SeoInventorySummary>> {
  const metros = getSeoMetroCatalogForDashboard()
  const entries = await Promise.all(
    metros.map(async (metro) => {
      const { summary } = await fetchMetroInventory(metro, { limit: 200 })
      return [metro.slug, summary] as const
    })
  )
  return Object.fromEntries(entries)
}
