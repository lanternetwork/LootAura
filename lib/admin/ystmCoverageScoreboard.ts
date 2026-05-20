import {
  aggregateYstmCoverageObservations,
  type YstmCoverageObservationAggregate,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { loadLootAuraPublishedYstmIndex } from '@/lib/ingestion/ystmCoverage/ystmCoveragePublishedIndex'
import {
  computeCoveragePct,
  YSTM_COVERAGE_TARGET_PCT,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'
import {
  buildYstmSourceExpansionMetrics,
  type YstmSourceExpansionMetrics,
} from '@/lib/admin/ystmSourceExpansionMetrics'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmCoverageTrendPoint = {
  completedAt: string
  coveragePct: number | null
  validActiveYstmUrls: number
  publishedVisibleInAudit: number
}

export type YstmCoverageScoreboard = {
  targetPct: number
  generatedAt: string
  lastAuditAt: string | null
  lastAuditStatus: string | null
  validActiveYstmUrls: number
  publishedActiveLootAuraYstmUrls: number
  publishedVisibleInAuditFootprint: number
  missingValidYstmUrls: number
  coveragePct: number | null
  observationFootprintUrls: number
  missingByState: Record<string, number>
  missingByMetro: Record<string, number>
  trend: YstmCoverageTrendPoint[]
  lastRun: {
    listPagesFetched: number
    listingUrlsDiscovered: number
    detailPagesValidated: number
    configCursorAfter: number
  } | null
  sourceExpansion: YstmSourceExpansionMetrics
}

type AuditRunRow = {
  completed_at: string | null
  status: string
  coverage_pct: number | string | null
  valid_active_ystm_urls: number | null
  published_visible_in_audit: number | null
  list_pages_fetched: number | null
  listing_urls_discovered: number | null
  detail_pages_validated: number | null
  config_cursor_after: number | null
}

function topEntries(map: Record<string, number>, limit: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
  )
}

export async function buildYstmCoverageScoreboard(
  admin: ReturnType<typeof getAdminDb>
): Promise<YstmCoverageScoreboard> {
  const now = new Date()
  const [agg, publishedIndex, sourceExpansion, runsResult] = await Promise.all([
    aggregateYstmCoverageObservations(admin),
    loadLootAuraPublishedYstmIndex(admin, now),
    buildYstmSourceExpansionMetrics(admin, now.getTime()),
    fromBase(admin, 'ystm_coverage_audit_runs')
      .select(
        'completed_at, status, coverage_pct, valid_active_ystm_urls, published_visible_in_audit, list_pages_fetched, listing_urls_discovered, detail_pages_validated, config_cursor_after'
      )
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(48),
  ])

  if (runsResult.error) {
    throw new Error(runsResult.error.message)
  }

  const runs = (runsResult.data ?? []) as AuditRunRow[]
  const last = runs[0] ?? null
  const coveragePct = computeCoveragePct({
    validActiveYstmUrls: agg.validActiveYstmUrls,
    publishedVisibleInAudit: agg.publishedVisibleInAudit,
  })

  const trend: YstmCoverageTrendPoint[] = runs
    .filter((r) => r.completed_at)
    .map((r) => ({
      completedAt: r.completed_at as string,
      coveragePct:
        r.coverage_pct == null
          ? null
          : typeof r.coverage_pct === 'number'
            ? r.coverage_pct
            : Number.parseFloat(String(r.coverage_pct)),
      validActiveYstmUrls: r.valid_active_ystm_urls ?? 0,
      publishedVisibleInAudit: r.published_visible_in_audit ?? 0,
    }))
    .reverse()

  return {
    targetPct: YSTM_COVERAGE_TARGET_PCT,
    generatedAt: now.toISOString(),
    lastAuditAt: last?.completed_at ?? null,
    lastAuditStatus: last?.status ?? null,
    validActiveYstmUrls: agg.validActiveYstmUrls,
    publishedActiveLootAuraYstmUrls: publishedIndex.publishedActiveTotal,
    publishedVisibleInAuditFootprint: agg.publishedVisibleInAudit,
    missingValidYstmUrls: agg.missingValidYstmUrls,
    coveragePct,
    observationFootprintUrls: agg.observationCount,
    missingByState: topEntries(agg.missingByState, 20),
    missingByMetro: topEntries(agg.missingByMetro, 20),
    trend,
    lastRun: last
      ? {
          listPagesFetched: last.list_pages_fetched ?? 0,
          listingUrlsDiscovered: last.listing_urls_discovered ?? 0,
          detailPagesValidated: last.detail_pages_validated ?? 0,
          configCursorAfter: last.config_cursor_after ?? 0,
        }
      : null,
    sourceExpansion,
  }
}

export type { YstmSourceExpansionMetrics }

export type { YstmCoverageObservationAggregate }
