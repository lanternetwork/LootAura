import type { MetroInventoryResult } from '@/lib/seo/fetchMetroInventory'
import { SEO_METRO_MIN_ACTIVE_LISTINGS } from '@/lib/seo/metroCatalog'
import { requestCache } from '@/lib/seo/requestCache'
import { resolveSitemapSeoGate, type SitemapSeoGateState } from '@/lib/seo/resolveSitemapSeoGate'
import { loadMetroInventoryFromSnapshot } from '@/lib/seo/snapshots/loadSeoMetroInventory'
import {
  loadNearbyQualifiedMetros,
  loadSeoQualifiedMetroBySlug,
} from '@/lib/seo/snapshots/loadSeoQualifiedMetros'
import type { SeoMetro } from '@/lib/seo/types'
import { getAdminDb } from '@/lib/supabase/clients'

export type MetroPageContext = {
  metro: SeoMetro
  metroQualified: boolean
  gate: SitemapSeoGateState
  inventory: MetroInventoryResult
  nearbyMetros: SeoMetro[]
}

function qualifiedMetroRowToSeoMetro(row: {
  slug: string
  city: string | null
  state: string | null
  timezone: string | null
}): SeoMetro | null {
  if (!row.city?.trim() || !row.state?.trim() || !row.timezone?.trim()) {
    return null
  }
  return {
    slug: row.slug,
    city: row.city.trim(),
    state: row.state.trim().toUpperCase(),
    timezone: row.timezone.trim(),
    minActiveListings: SEO_METRO_MIN_ACTIVE_LISTINGS,
  }
}

/**
 * Request-scoped loader shared by generateMetadata() and page() for metro routes.
 */
export const loadMetroPageContext = requestCache(
  async (metroSlug: string): Promise<MetroPageContext | null> => {
    const admin = getAdminDb()
    const [gate, metroRow] = await Promise.all([
      resolveSitemapSeoGate(),
      loadSeoQualifiedMetroBySlug(metroSlug, admin),
    ])

    if (!metroRow) {
      return null
    }

    const metro = qualifiedMetroRowToSeoMetro(metroRow)
    if (!metro) {
      return null
    }

    const [inventory, nearbyRows] = await Promise.all([
      loadMetroInventoryFromSnapshot(metroSlug, admin),
      loadNearbyQualifiedMetros(metro, admin),
    ])

    const nearbyMetros = nearbyRows
      .map((row) => qualifiedMetroRowToSeoMetro(row))
      .filter((m): m is SeoMetro => m != null)

    return {
      metro,
      metroQualified: metroRow.qualified,
      gate,
      inventory,
      nearbyMetros,
    }
  }
)
