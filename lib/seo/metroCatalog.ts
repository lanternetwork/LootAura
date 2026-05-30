import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { T } from '@/lib/supabase/tables'
import { applyPublishedSaleCityStateFootprint } from '@/lib/seo/publishedSaleCityStateQuery'
import type { SeoMetro } from '@/lib/seo/types'

/** Minimum active listings before a metro qualifies for index rollout (nationwide default). */
export const SEO_METRO_MIN_ACTIVE_LISTINGS = 25

const DEFAULT_TIMEZONE = 'America/Chicago'

/** US state → primary IANA timezone for weekend boundaries. */
const STATE_TIMEZONE: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Boise',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
  DC: 'America/New_York',
}

export function buildMetroSlug(city: string, state: string): string {
  const cityPart = city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const statePart = state.trim().toLowerCase()
  return `${cityPart}-${statePart}`
}

function timezoneForState(state: string): string {
  return STATE_TIMEZONE[state.trim().toUpperCase()] ?? DEFAULT_TIMEZONE
}

function saleRowToMetro(city: string, state: string): SeoMetro {
  const normalizedState = state.trim().toUpperCase()
  return {
    slug: buildMetroSlug(city, state),
    city: city.trim(),
    state: normalizedState,
    timezone: timezoneForState(normalizedState),
    minActiveListings: SEO_METRO_MIN_ACTIVE_LISTINGS,
  }
}

/**
 * Nationwide metro catalog — every city/state with current published sale footprint.
 * No pilot list, expansion list, or manual activation.
 */
export async function discoverSeoMetrosFromPublishedSales(): Promise<SeoMetro[]> {
  const admin = getAdminDb()

  const { data, error } = await applyPublishedSaleCityStateFootprint(
    fromBase(admin, T.sales).select('city, state')
  ).limit(15000)

  if (error) {
    console.error('[SEO_METRO_DISCOVERY] failed:', error.message)
    return []
  }

  const bySlug = new Map<string, SeoMetro>()
  for (const row of data ?? []) {
    const city = (row as { city?: string }).city
    const state = (row as { state?: string }).state
    if (!city?.trim() || !state?.trim()) continue
    const metro = saleRowToMetro(city, state)
    if (!bySlug.has(metro.slug)) {
      bySlug.set(metro.slug, metro)
    }
  }

  return Array.from(bySlug.values()).sort((a, b) => a.slug.localeCompare(b.slug))
}

export function getSeoMetroBySlug(metros: SeoMetro[], slug: string): SeoMetro | undefined {
  return metros.find((m) => m.slug === slug)
}

/** Resolve metro identity from sale city/state (nationwide; no allowlist). */
export function resolveSeoMetroForSale(
  sale: { city?: string | null; state?: string | null },
  metros?: SeoMetro[]
): SeoMetro | null {
  if (!sale.city?.trim() || !sale.state?.trim()) return null
  const slug = buildMetroSlug(sale.city, sale.state)
  if (metros) {
    return getSeoMetroBySlug(metros, slug) ?? null
  }
  return saleRowToMetro(sale.city, sale.state)
}

export function getNearbyMetros(metro: SeoMetro, allMetros: SeoMetro[], limit = 4): SeoMetro[] {
  return allMetros
    .filter((m) => m.slug !== metro.slug)
    .sort((a, b) => {
      const aSameState = a.state === metro.state ? 0 : 1
      const bSameState = b.state === metro.state ? 0 : 1
      if (aSameState !== bSameState) return aSameState - bSameState
      return a.city.localeCompare(b.city)
    })
    .slice(0, limit)
}
