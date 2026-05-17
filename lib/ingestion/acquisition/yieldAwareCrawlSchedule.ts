import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import {
  computeConfigCrawlScheduleWeight,
  type ConfigCrawlStatsSnapshot,
} from '@/lib/ingestion/acquisition/configCrawlStats'

export type CrawlConfigRow = ExternalCityConfigRow & ConfigCrawlStatsSnapshot

function pickPrimaryDomainFromSourcePages(rawPages: unknown): string | null {
  const pages = normalizeSourcePages(rawPages)
  for (const page of pages) {
    try {
      return new URL(page).hostname.toLowerCase()
    } catch {
      continue
    }
  }
  return null
}

function sortDeterministic(rows: CrawlConfigRow[]): CrawlConfigRow[] {
  return [...rows].sort((a, b) => {
    const aCity = `${a.state || ''}|${a.city || ''}`.toLowerCase()
    const bCity = `${b.state || ''}|${b.city || ''}`.toLowerCase()
    if (aCity !== bCity) return aCity.localeCompare(bCity)
    const aPages = normalizeSourcePages(a.source_pages).join('|')
    const bPages = normalizeSourcePages(b.source_pages).join('|')
    return aPages.localeCompare(bPages)
  })
}

/** Domain-fair interleave (same as daily cron) on an ordered list. */
export function interleaveCrawlConfigsByDomain(rows: CrawlConfigRow[]): CrawlConfigRow[] {
  const byDomain = new Map<string, CrawlConfigRow[]>()
  const domainOrder: string[] = []
  for (const row of rows) {
    const domain = pickPrimaryDomainFromSourcePages(row.source_pages) ?? '__unknown__'
    if (!byDomain.has(domain)) {
      byDomain.set(domain, [])
      domainOrder.push(domain)
    }
    byDomain.get(domain)!.push(row)
  }

  const out: CrawlConfigRow[] = []
  while (true) {
    let added = false
    for (const domain of domainOrder) {
      const q = byDomain.get(domain)
      if (!q || q.length === 0) continue
      const next = q.shift()
      if (next) {
        out.push(next)
        added = true
      }
    }
    if (!added) break
  }
  return out
}

/**
 * Weighted weave: 2 high-yield slots per 1 normal per 1 saturated floor (anti-starvation).
 * Then domain-interleave for fetch pacing.
 */
export function weaveYieldTieredConfigs(rows: CrawlConfigRow[], nowMs: number): CrawlConfigRow[] {
  const high: CrawlConfigRow[] = []
  const normal: CrawlConfigRow[] = []
  const low: CrawlConfigRow[] = []

  for (const row of rows) {
    const weight = computeConfigCrawlScheduleWeight(row, nowMs)
    if (weight >= 70) high.push(row)
    else if (weight >= 35) normal.push(row)
    else low.push(row)
  }

  const queues = [sortDeterministic(high), sortDeterministic(normal), sortDeterministic(low)]
  const pattern = [2, 1, 1]
  const out: CrawlConfigRow[] = []
  const indices = [0, 0, 0]

  while (true) {
    let added = false
    for (let tier = 0; tier < queues.length; tier += 1) {
      const take = pattern[tier] ?? 1
      for (let n = 0; n < take; n += 1) {
        const q = queues[tier]
        if (indices[tier] < q.length) {
          out.push(q[indices[tier]!]!)
          indices[tier] += 1
          added = true
        }
      }
    }
    if (!added) break
    if (indices.every((idx, tier) => idx >= queues[tier].length)) break
  }

  return out
}

export function buildYieldAwareCrawlPlan(rows: CrawlConfigRow[], nowMs?: number): CrawlConfigRow[] {
  const ts = nowMs ?? Date.now()
  if (rows.length <= 1) return rows
  const woven = weaveYieldTieredConfigs(rows, ts)
  return interleaveCrawlConfigsByDomain(woven)
}
