import type { MetroInventoryResult } from '@/lib/seo/fetchMetroInventory'
import { SEO_METRO_MIN_ACTIVE_LISTINGS } from '@/lib/seo/metroCatalog'
import { resolveMetroPageRobotsFromSnapshot } from '@/lib/seo/indexRollout'
import { requestCache } from '@/lib/seo/requestCache'
import {
  getSeededMajorMetroBySlug,
  seededMetroToSeoMetro,
} from '@/lib/seo/seededMajorMetros'
import { resolveMetroExistence } from '@/lib/seo/resolveMetroExistence'
import { resolveSitemapSeoGate, type SitemapSeoGateState } from '@/lib/seo/resolveSitemapSeoGate'
import {
  countMetroInventoryBySlug,
  loadMetroInventoryFromSnapshot,
} from '@/lib/seo/snapshots/loadSeoMetroInventory'
import { loadSeoMetroHistoryBySlug } from '@/lib/seo/snapshots/loadSeoMetroHistory'
import {
  loadNearbyQualifiedMetros,
  loadSeoQualifiedMetroBySlug,
} from '@/lib/seo/snapshots/loadSeoQualifiedMetros'
import type { SeoMetro } from '@/lib/seo/types'
import { getAdminDb } from '@/lib/supabase/clients'

export type MetroPageRobotsDirective = 'index,follow' | 'noindex,follow'

export type MetroPageContext = {
  slug: string
  city: string
  state: string
  timezone: string
  exists: boolean
  seededMajor: boolean
  qualified: boolean
  inventoryCount: number
  historicalCount90d: number
  robots: MetroPageRobotsDirective
  metro: SeoMetro
  /** @deprecated use qualified */
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

function resolveMetroIdentity(
  slug: string,
  seeded: ReturnType<typeof getSeededMajorMetroBySlug>,
  metroRow: Awaited<ReturnType<typeof loadSeoQualifiedMetroBySlug>>,
  historyRow: Awaited<ReturnType<typeof loadSeoMetroHistoryBySlug>>
): SeoMetro | null {
  if (seeded) {
    return seededMetroToSeoMetro(seeded)
  }
  if (metroRow) {
    const fromQualified = qualifiedMetroRowToSeoMetro(metroRow)
    if (fromQualified) return fromQualified
  }
  if (historyRow?.city && historyRow.state && historyRow.timezone) {
    return {
      slug,
      city: historyRow.city.trim(),
      state: historyRow.state.trim().toUpperCase(),
      timezone: historyRow.timezone.trim(),
      minActiveListings: SEO_METRO_MIN_ACTIVE_LISTINGS,
    }
  }
  return null
}

function robotsDirectiveFromGate(
  seoEmissionAllowed: boolean,
  qualified: boolean,
  seededMajor: boolean
): MetroPageRobotsDirective {
  const robots = resolveMetroPageRobotsFromSnapshot(seoEmissionAllowed, qualified, seededMajor)
  return robots.index ? 'index,follow' : 'noindex,follow'
}

/**
 * Request-scoped loader shared by generateMetadata() and page() for metro routes.
 */
export const loadMetroPageContext = requestCache(
  async (metroSlug: string): Promise<MetroPageContext | null> => {
    const admin = getAdminDb()
    const seeded = getSeededMajorMetroBySlug(metroSlug)

    const [gate, metroRow, historyRow, inventoryDbCount] = await Promise.all([
      resolveSitemapSeoGate(),
      loadSeoQualifiedMetroBySlug(metroSlug, admin),
      loadSeoMetroHistoryBySlug(metroSlug, admin),
      countMetroInventoryBySlug(metroSlug, admin),
    ])

    const historicalCount90d = historyRow?.inventory_count_90d ?? 0
    const existence = resolveMetroExistence({
      slug: metroSlug,
      inventoryDbCount,
      historicalCount90d,
    })

    if (!existence.exists) {
      return null
    }

    const metro = resolveMetroIdentity(metroSlug, seeded, metroRow, historyRow)
    if (!metro) {
      return null
    }

    const qualified = metroRow?.qualified ?? false
    const seededMajor = existence.seededMajor

    const [inventory, nearbyRows] = await Promise.all([
      loadMetroInventoryFromSnapshot(metroSlug, admin),
      loadNearbyQualifiedMetros(metro, admin),
    ])

    const nearbyMetros = nearbyRows
      .map((row) => qualifiedMetroRowToSeoMetro(row))
      .filter((m): m is SeoMetro => m != null)

    const inventoryCount = inventory.summary.activeListingCount
    const robots = robotsDirectiveFromGate(gate.seoEmissionAllowed, qualified, seededMajor)

    return {
      slug: metro.slug,
      city: metro.city,
      state: metro.state,
      timezone: metro.timezone,
      exists: true,
      seededMajor,
      qualified,
      inventoryCount,
      historicalCount90d,
      robots,
      metro,
      metroQualified: qualified,
      gate,
      inventory,
      nearbyMetros,
    }
  }
)
