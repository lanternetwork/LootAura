import { discoverSeoMetrosFromPublishedSales } from '@/lib/seo/metroCatalog'
import { fetchMetroInventory } from '@/lib/seo/fetchMetroInventory'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'

export type SeoNationwideInventorySnapshot = {
  metros: SeoMetro[]
  inventoryBySlug: Record<string, SeoInventorySummary>
}

/**
 * Live inventory for all metros with published sale footprint (nationwide discovery).
 */
export async function fetchNationwideSeoMetroInventory(): Promise<SeoNationwideInventorySnapshot> {
  const metros = await discoverSeoMetrosFromPublishedSales()
  const entries = await Promise.all(
    metros.map(async (metro) => {
      const { summary } = await fetchMetroInventory(metro, { limit: 200 })
      return [metro.slug, summary] as const
    })
  )
  return {
    metros,
    inventoryBySlug: Object.fromEntries(entries),
  }
}

/** @deprecated use fetchNationwideSeoMetroInventory */
export async function fetchAllSeoMetroInventory(): Promise<Record<string, SeoInventorySummary>> {
  const { inventoryBySlug } = await fetchNationwideSeoMetroInventory()
  return inventoryBySlug
}
