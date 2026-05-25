import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import {
  interleaveCrawlConfigsByDomain,
  type CrawlConfigRow,
} from '@/lib/ingestion/acquisition/yieldAwareCrawlSchedule'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { ESNET_SOURCE_PLATFORM } from '@/lib/ingestion/estatesalesnet/constants'

const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

export type EsnetRefreshTier =
  | 'expired'
  | 'dormant'
  | 'upcoming'
  | 'approaching'
  | 'imminent'
  | 'active'

export type EsnetRefreshPolicy = {
  tier: EsnetRefreshTier
  /** Minimum ms between metro list recrawls for this config. `null` = skip crawl. */
  minIntervalMs: number | null
}

export function computeEsnetRefreshPolicy(args: {
  dateStart: string | null
  dateEnd: string | null
  nowMs?: number
}): EsnetRefreshPolicy {
  const nowMs = args.nowMs ?? Date.now()
  const startMs = args.dateStart ? Date.parse(args.dateStart) : Number.NaN
  const endMs = args.dateEnd ? Date.parse(args.dateEnd) : Number.NaN

  if (Number.isFinite(endMs) && nowMs > endMs + MS_PER_DAY) {
    return { tier: 'expired', minIntervalMs: null }
  }

  if (!Number.isFinite(startMs)) {
    return { tier: 'dormant', minIntervalMs: MS_PER_DAY }
  }

  const msUntilStart = startMs - nowMs

  if (msUntilStart > 7 * MS_PER_DAY) {
    return { tier: 'dormant', minIntervalMs: MS_PER_DAY }
  }

  if (msUntilStart > 2 * MS_PER_DAY) {
    return { tier: 'upcoming', minIntervalMs: 12 * MS_PER_HOUR }
  }

  if (msUntilStart > 48 * MS_PER_HOUR) {
    return { tier: 'approaching', minIntervalMs: 12 * MS_PER_HOUR }
  }

  if (msUntilStart > 0) {
    return { tier: 'imminent', minIntervalMs: 4 * MS_PER_HOUR }
  }

  if (Number.isFinite(endMs) && nowMs <= endMs) {
    return { tier: 'active', minIntervalMs: 2 * MS_PER_HOUR }
  }

  return { tier: 'expired', minIntervalMs: null }
}

type MetroSaleDates = {
  dateStart: string | null
  dateEnd: string | null
}

function minIsoDate(dates: Array<string | null>): string | null {
  const parsed = dates
    .map((d) => (d ? Date.parse(d) : Number.NaN))
    .filter((ms) => Number.isFinite(ms))
  if (parsed.length === 0) return null
  const minMs = Math.min(...parsed)
  return new Date(minMs).toISOString().slice(0, 10)
}

function maxIsoDate(dates: Array<string | null>): string | null {
  const parsed = dates
    .map((d) => (d ? Date.parse(d) : Number.NaN))
    .filter((ms) => Number.isFinite(ms))
  if (parsed.length === 0) return null
  const maxMs = Math.max(...parsed)
  return new Date(maxMs).toISOString().slice(0, 10)
}

async function loadMetroSaleDateHints(
  admin: ReturnType<typeof getAdminDb>,
  rows: ExternalCityConfigRow[]
): Promise<Map<string, MetroSaleDates>> {
  const keys = rows.map((r) => `${r.state}|${r.city}`)
  const unique = [...new Set(keys)]
  const out = new Map<string, MetroSaleDates>()
  if (unique.length === 0) return out

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('city, state, date_start, date_end')
    .eq('source_platform', ESNET_SOURCE_PLATFORM)
    .eq('is_duplicate', false)
    .is('superseded_by_ingested_sale_id', null)
    .limit(5000)

  if (error || !data) return out

  const byMetro = new Map<string, { starts: string[]; ends: string[] }>()
  for (const row of data as Array<{
    city: string
    state: string
    date_start: string | null
    date_end: string | null
  }>) {
    const key = `${row.state}|${row.city}`
    if (!byMetro.has(key)) {
      byMetro.set(key, { starts: [], ends: [] })
    }
    const bucket = byMetro.get(key)!
    if (row.date_start) bucket.starts.push(row.date_start)
    if (row.date_end) bucket.ends.push(row.date_end)
  }

  for (const [key, bucket] of byMetro) {
    out.set(key, {
      dateStart: minIsoDate(bucket.starts),
      dateEnd: maxIsoDate(bucket.ends),
    })
  }

  return out
}

function refreshPriority(policy: EsnetRefreshPolicy): number {
  switch (policy.tier) {
    case 'active':
      return 100
    case 'imminent':
      return 90
    case 'approaching':
      return 70
    case 'upcoming':
      return 50
    case 'dormant':
      return 30
    case 'expired':
    default:
      return 0
  }
}

/**
 * Order ES.net metro configs for crawl: active/imminent first; drop expired metros.
 */
export async function buildEsnetAdaptiveCrawlPlan(
  admin: ReturnType<typeof getAdminDb>,
  rows: ExternalCityConfigRow[],
  nowMs: number = Date.now()
): Promise<CrawlConfigRow[]> {
  const dateHints = await loadMetroSaleDateHints(admin, rows)
  const scored: Array<{ row: CrawlConfigRow; priority: number }> = []

  for (const row of rows) {
    const key = `${row.state}|${row.city}`
    const hint = dateHints.get(key) ?? { dateStart: null, dateEnd: null }
    const policy = computeEsnetRefreshPolicy({
      dateStart: hint.dateStart,
      dateEnd: hint.dateEnd,
      nowMs,
    })
    if (policy.minIntervalMs == null) continue
    scored.push({
      row: row as CrawlConfigRow,
      priority: refreshPriority(policy),
    })
  }

  scored.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const aKey = `${a.row.state}|${a.row.city}`
    const bKey = `${b.row.state}|${b.row.city}`
    return aKey.localeCompare(bKey)
  })

  return interleaveCrawlConfigsByDomain(scored.map((s) => s.row))
}
