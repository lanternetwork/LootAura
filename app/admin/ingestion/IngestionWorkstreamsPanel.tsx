'use client'

import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { buildQueueHealthSummary } from '@/lib/admin/ingestionDashboardOverview'
import {
  STABILIZATION_CANONICAL_COVERAGE_MIN_PCT,
  STABILIZATION_CATALOG_REPAIR_MAX,
  STABILIZATION_MISSING_VALID_NEAR_ZERO,
} from '@/lib/admin/ystmStabilizationExitCriteria'
import {
  CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING,
  CRAWL_SKIP_TAXONOMY_MIN_SAMPLES,
} from '@/lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth'

type WorkstreamStatus = 'blocked' | 'ready' | 'watch' | 'info'

type WorkstreamCard = {
  id: string
  title: string
  status: WorkstreamStatus
  metric: string
  action: string
}

const STATUS_STYLE: Record<WorkstreamStatus, string> = {
  blocked: 'border-red-300 bg-red-50 text-red-950',
  ready: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  watch: 'border-amber-300 bg-amber-50 text-amber-950',
  info: 'border-slate-200 bg-slate-50 text-slate-800',
}

type Props = {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  onOpenDebug?: () => void
}

export default function IngestionWorkstreamsPanel({ metrics, coverage, onOpenDebug }: Props) {
  const queues = buildQueueHealthSummary(metrics, coverage)
  const duplicateClusters = coverage?.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? null
  const canonicalPct = coverage?.canonicalSaleInstance.canonicalCoveragePct ?? null
  const crawl = metrics.volume.fetch.crawlSkipTaxonomy24h
  const suspiciousShare =
    crawl && crawl.total >= CRAWL_SKIP_TAXONOMY_MIN_SAMPLES ? crawl.suspicious / crawl.total : null

  const cards: WorkstreamCard[] = [
    {
      id: 'A',
      title: 'Duplicate canonical publish clusters',
      status:
        duplicateClusters == null
          ? 'info'
          : duplicateClusters > 0
            ? 'blocked'
            : 'ready',
      metric:
        duplicateClusters == null
          ? 'Convergence data unavailable'
          : `${duplicateClusters} cluster(s)`,
      action:
        duplicateClusters != null && duplicateClusters > 0
          ? 'Remediate in Debug → duplicate clusters before backfill or ES.net resume.'
          : 'No duplicate canonical publish clusters.',
    },
    {
      id: 'B',
      title: 'Canonical key backfill',
      status:
        duplicateClusters != null && duplicateClusters > 0
          ? 'blocked'
          : canonicalPct != null && canonicalPct >= STABILIZATION_CANONICAL_COVERAGE_MIN_PCT
            ? 'ready'
            : 'watch',
      metric:
        canonicalPct == null
          ? 'Coverage unavailable'
          : `${canonicalPct.toFixed(1)}% active rows with canonical key (target ≥${STABILIZATION_CANONICAL_COVERAGE_MIN_PCT}%)`,
      action:
        duplicateClusters != null && duplicateClusters > 0
          ? 'Blocked until Workstream A is clear.'
          : 'Run batched canonical backfill below after clusters = 0.',
    },
    {
      id: 'C',
      title: 'Suspicious crawl-skip triage',
      status:
        suspiciousShare == null
          ? 'info'
          : suspiciousShare >= CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING
            ? 'watch'
            : 'ready',
      metric:
        suspiciousShare == null
          ? crawl.total < CRAWL_SKIP_TAXONOMY_MIN_SAMPLES
            ? `Insufficient classified skips (n=${crawl.total})`
            : '—'
          : `${(suspiciousShare * 100).toFixed(1)}% suspicious of ${crawl.total.toLocaleString()} classified skips`,
      action:
        'Debug → crawl skip taxonomy: if bootstrap ON, date-change + refresh-queued is often expected. When bootstrap OFF, sample 50× url_match_dates_changed per YSTM_CRAWL_SKIP_TRIAGE_RUNBOOK.md; no global dedupe changes.',
    },
    {
      id: 'D',
      title: 'Catalog repair drain',
      status:
        queues.catalogRepair >= STABILIZATION_CATALOG_REPAIR_MAX
          ? 'watch'
          : queues.catalogRepair === 0
            ? 'ready'
            : 'watch',
      metric: `${queues.catalogRepair.toLocaleString()} in repair queue (Tier 1 target <${STABILIZATION_CATALOG_REPAIR_MAX})`,
      action: 'Let repair crons drain; watch detail-first fallback rows in false-exclusion audit.',
    },
    {
      id: 'E',
      title: 'Existing refresh stale backlog',
      status: queues.refreshStale > 0 ? 'watch' : 'ready',
      metric: `${queues.refreshStale.toLocaleString()} stale >12h`,
      action: 'Track daily trend in ops log; should be flat or down during stabilization.',
    },
    {
      id: 'F',
      title: 'Address enrichment',
      status: queues.addressEnrichment > 50 ? 'watch' : 'info',
      metric: `${queues.addressEnrichment.toLocaleString()} backlog`,
      action: 'Monitor while repair and missing-ingest run; not a Tier 1 gate.',
    },
    {
      id: 'G',
      title: 'Needs check queue',
      status: queues.needsCheck > 25 ? 'watch' : 'info',
      metric: `${queues.needsCheck.toLocaleString()} needs_check`,
      action: 'Triage after repair queue and missing URLs are under control.',
    },
    {
      id: 'H',
      title: 'Publish race / terminal publish_failed',
      status: queues.publishFailed > 0 ? 'watch' : 'ready',
      metric: `${queues.publishFailed.toLocaleString()} publish_failed`,
      action: 'Design-only during stabilization; do not force-publish gated rows.',
    },
  ]

  return (
    <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Stabilization workstreams (A–H)</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Operator sequence from the YSTM stabilization program. Tier 1 exit gates are on Overview;
            telemetry is in Debug.
          </p>
          {coverage && (
            <p className="mt-2 text-xs text-slate-500">
              Missing valid URLs: {coverage.missingValidYstmUrls.toLocaleString()} (Tier 1 ≤
              {STABILIZATION_MISSING_VALID_NEAR_ZERO})
            </p>
          )}
        </div>
        {onOpenDebug && (
          <button
            type="button"
            onClick={onOpenDebug}
            className="rounded-md border border-indigo-400 bg-white px-3 py-1.5 text-sm font-medium text-indigo-900 hover:bg-indigo-50"
          >
            Open Debug tab
          </button>
        )}
      </div>

      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {cards.map((card) => (
          <li
            key={card.id}
            className={`rounded-md border px-4 py-3 text-sm ${STATUS_STYLE[card.status]}`}
          >
            <p className="font-semibold">
              {card.id}. {card.title}
            </p>
            <p className="mt-1 tabular-nums">{card.metric}</p>
            <p className="mt-2 text-xs opacity-90">{card.action}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
