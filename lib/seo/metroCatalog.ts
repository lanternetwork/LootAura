import { SEO_ACTIVE_EXPANSION_METROS, SEO_EXPANSION_METRO_CANDIDATES } from '@/lib/seo/expansionMetros'
import { SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'
import type { SeoPilotMetro } from '@/lib/seo/types'

/**
 * Pilot metros always ship SSR surfaces; expansion metros require code promotion
 * into `SEO_ACTIVE_EXPANSION_METROS` (move from candidates in expansionMetros.ts).
 */
export function getSeoActiveMetros(): SeoPilotMetro[] {
  return [...SEO_PILOT_METROS, ...SEO_ACTIVE_EXPANSION_METROS]
}

export function getSeoMetroCatalogForDashboard(): SeoPilotMetro[] {
  const seen = new Set<string>()
  const merged: SeoPilotMetro[] = []
  for (const metro of [...SEO_PILOT_METROS, ...SEO_EXPANSION_METRO_CANDIDATES]) {
    if (seen.has(metro.slug)) continue
    seen.add(metro.slug)
    merged.push(metro)
  }
  return merged
}

export function getSeoMetroBySlug(slug: string): SeoPilotMetro | undefined {
  return getSeoMetroCatalogForDashboard().find((m) => m.slug === slug)
}

export function isSeoPilotMetro(slug: string): boolean {
  return SEO_PILOT_METROS.some((m) => m.slug === slug)
}

export function isSeoMetroActive(slug: string): boolean {
  return getSeoActiveMetros().some((m) => m.slug === slug)
}
