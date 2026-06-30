'use client'

import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import {
  BENIGN_CRAWL_SKIP_SUB_REASONS,
  EXTERNAL_CRAWL_SKIP_SUB_REASONS,
  SUSPICIOUS_CRAWL_SKIP_SUB_REASONS,
  crawlSkipSubReasonCategory,
} from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import {
  CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING,
  CRAWL_SKIP_TAXONOMY_MIN_SAMPLES,
} from '@/lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth'

function pct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(1)}%`
}

export default function CrawlSkipTaxonomySection({
  fetch,
}: {
  fetch: IngestionMetricsResponse['volume']['fetch']
}) {
  const rollup = fetch.crawlSkipTaxonomy24h
  const alerts = fetch.crawlSkipTaxonomyAlerts ?? []
  const topReasons = EXTERNAL_CRAWL_SKIP_SUB_REASONS.filter((r) => (rollup.subReasons[r] ?? 0) > 0)
    .map((r) => ({ reason: r, count: rollup.subReasons[r], category: crawlSkipSubReasonCategory(r) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return (
    <section
      className="mb-6 rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
      aria-label="Phase 2 crawl skip taxonomy"
    >
      <h2 className="text-lg font-semibold text-gray-900">Crawl skip taxonomy (Phase 2)</h2>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Classified skip sub-reasons from external crawl (observability only — suppression behavior is unchanged).
        Alerts use <strong>suspicious share</strong> of classified skips (≥
        {(CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING * 100).toFixed(0)}% when n≥{CRAWL_SKIP_TAXONOMY_MIN_SAMPLES}), not total
        duplicate skip rate or publish failures.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        During nationwide <strong>coverage bootstrap</strong>, elevated{' '}
        <code className="text-[11px]">url_match_dates_changed</code> plus benign{' '}
        <code className="text-[11px]">url_match_refresh_queued</code> is expected. Triage when bootstrap is OFF or
        repair is draining and suspicious share stays high.
      </p>

      {alerts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {alerts.map((alert) => (
            <li
              key={alert.code}
              className={`rounded-md border px-3 py-2 text-sm ${
                alert.level === 'critical'
                  ? 'border-red-300 bg-red-50 text-red-950'
                  : 'border-amber-300 bg-amber-50 text-amber-950'
              }`}
            >
              <span className="font-semibold uppercase">{alert.level}</span>: {alert.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
          <p className="text-xs text-slate-700">Classified</p>
          <p className="font-semibold tabular-nums">{rollup.total}</p>
        </div>
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm">
          <p className="text-xs text-emerald-900">Benign</p>
          <p className="font-semibold tabular-nums">{rollup.benign}</p>
        </div>
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm">
          <p className="text-xs text-amber-950">Suspicious</p>
          <p className="font-semibold tabular-nums">{rollup.suspicious}</p>
        </div>
        <div className="rounded-md bg-sky-50 px-3 py-2 text-sm">
          <p className="text-xs text-sky-900">Operational</p>
          <p className="font-semibold tabular-nums">{rollup.operational}</p>
        </div>
        <div className="rounded-md bg-violet-50 px-3 py-2 text-sm">
          <p className="text-xs text-violet-900">Suspicious share</p>
          <p className="font-semibold tabular-nums">{pct(rollup.suspiciousShare)}</p>
        </div>
      </div>

      {topReasons.length > 0 ? (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-600">
              <th className="py-1 pr-2 font-medium">Sub-reason</th>
              <th className="py-1 pr-2 font-medium">Category</th>
              <th className="py-1 font-medium text-right">24h</th>
            </tr>
          </thead>
          <tbody>
            {topReasons.map((row) => (
              <tr key={row.reason} className="border-b border-gray-100">
                <td className="py-1 pr-2 font-mono text-xs">{row.reason}</td>
                <td className="py-1 pr-2 capitalize text-gray-700">{row.category}</td>
                <td className="py-1 text-right tabular-nums">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          No classified skips in the 24h window yet — telemetry appears after the next external crawl
          runs with Phase 2 deployed.
        </p>
      )}

      {rollup.total >= CRAWL_SKIP_TAXONOMY_MIN_SAMPLES &&
        rollup.suspiciousShare != null &&
        rollup.suspiciousShare >= CRAWL_SKIP_SUSPICIOUS_SHARE_WARNING && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-medium">Triage checklist (Workstream E)</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
              <li>Confirm bootstrap state on Controls — defer if ON and top reasons are date-change + refresh-queued.</li>
              <li>Sample ~50× <code className="text-[11px]">url_match_dates_changed</code> (benign refresh vs false suppression).</li>
              <li>Document A/B/C/D counts in ops log; code fix only for confirmed false suppression (no global dedupe change).</li>
            </ol>
          </div>
        )}

      <p className="mt-3 text-xs text-gray-500">
        Benign: {BENIGN_CRAWL_SKIP_SUB_REASONS.join(', ')} · Suspicious:{' '}
        {SUSPICIOUS_CRAWL_SKIP_SUB_REASONS.join(', ')}
      </p>
    </section>
  )
}
