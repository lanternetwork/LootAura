/**
 * Auto-provisions `ingestion_city_configs` when a listing URL implies a YSTM city page
 * but no config row exists yet. Intended for the manual upload path and any future
 * ingest writers that hit `missing_city_config`.
 *
 * Hook placement: call from **ingestion / persist** (same tier as upload + external adapter),
 * not publish — configs must exist before cron `external_page_source` fetch runs.
 *
 * Concurrency: uses PostgREST `Prefer: resolution=ignore-duplicates` (see `upsert` call below),
 * i.e. `INSERT … ON CONFLICT (city, state, source_platform) DO NOTHING`. No read-merge-write;
 * existing rows are never updated by this path.
 */

import { fromBase, getAdminDb } from '@/lib/supabase/clients'

type AdminDb = ReturnType<typeof getAdminDb>
import { logger } from '@/lib/log'

const YSTM_HOSTS = new Set(['yardsaletreasuremap.com', 'www.yardsaletreasuremap.com'])
const DEFAULT_TIMEZONE = 'America/Chicago'
const EXTERNAL_PAGE_SOURCE = 'external_page_source'

/**
 * From a YSTM listing or city URL, derive the canonical city list page
 * (`/US/{StateSegment}/{CitySlug}.html`).
 */
export function deriveYardsaleTreasureMapCityPageUrl(sourceUrl: string): string | null {
  let u: URL
  try {
    u = new URL(sourceUrl)
  } catch {
    return null
  }
  if (!YSTM_HOSTS.has(u.hostname.toLowerCase())) {
    return null
  }
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts.length < 3 || parts[0] !== 'US') {
    return null
  }
  const stateSeg = parts[1]
  const third = parts[2]
  if (!stateSeg || !third) {
    return null
  }
  if (third.toLowerCase().endsWith('.html')) {
    return `${u.origin}/US/${stateSeg}/${third}`
  }
  const citySlug = third
  return `${u.origin}/US/${stateSeg}/${citySlug}.html`
}

/**
 * Inserts a new city config row only. If `(city, state, source_platform)` already exists,
 * PostgREST ignores the duplicate — no update, no merge.
 *
 * Supabase: `.upsert(payload, { onConflict: 'city,state,source_platform', ignoreDuplicates: true })`
 * → `Prefer: resolution=ignore-duplicates` → SQL `ON CONFLICT DO NOTHING`.
 */
export async function ensureIngestionCityConfigFromListingSource(
  admin: AdminDb,
  args: {
    city: string
    stateCode: string
    sourcePlatform: string
    sourceUrl: string
  }
): Promise<{ ok: true; cityPageUrl: string } | { ok: false; reason: string }> {
  if (args.sourcePlatform !== EXTERNAL_PAGE_SOURCE) {
    return { ok: false, reason: 'unsupported_source_platform' }
  }
  const city = args.city.replace(/\s+/g, ' ').trim()
  const stateCode = args.stateCode.trim().toUpperCase()
  if (!city || !stateCode) {
    return { ok: false, reason: 'missing_city_or_state' }
  }

  const cityPageUrl = deriveYardsaleTreasureMapCityPageUrl(args.sourceUrl)
  if (!cityPageUrl) {
    return { ok: false, reason: 'could_not_derive_city_page_url' }
  }

  const { error } = await fromBase(admin, 'ingestion_city_configs').upsert(
    {
      city,
      state: stateCode,
      source_platform: EXTERNAL_PAGE_SOURCE,
      enabled: true,
      timezone: DEFAULT_TIMEZONE,
      source_pages: [cityPageUrl],
    },
    { onConflict: 'city,state,source_platform', ignoreDuplicates: true }
  )

  if (error) {
    logger.warn('ensureCityConfig: insert-or-ignore failed', {
      component: 'ingestion/ensureCityConfigFromListingSource',
      operation: 'insert_on_conflict_do_nothing',
      message: error.message,
      city,
      state: stateCode,
    })
    return { ok: false, reason: 'insert_failed' }
  }

  return { ok: true, cityPageUrl }
}
