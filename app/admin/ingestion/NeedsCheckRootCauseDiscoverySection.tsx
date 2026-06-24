'use client'

import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  CATEGORY_LABELS,
  evaluateNeedsCheckRootCauseDiscovery,
  OWNER_LABELS,
} from '@/lib/admin/evaluateNeedsCheckRootCauseDiscovery'

type Props = {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  diagnosticsLoading?: boolean
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export default function NeedsCheckRootCauseDiscoverySection({
  metrics,
  coverage,
  diagnosticsLoading = false,
}: Props) {
  const analysis = metrics.needsCheckRootCauseAnalysis
  if (diagnosticsLoading && !analysis) {
    return (
      <section className="rounded-lg border border-violet-200 bg-violet-50/30 p-5 text-sm text-violet-900">
        Loading needs_check root-cause diagnostics…
      </section>
    )
  }
  if (!analysis || analysis.total === 0) {
    return null
  }

  const discovery = evaluateNeedsCheckRootCauseDiscovery(
    analysis,
    metrics,
    coverage,
    metrics.generatedAt
  )
  const breakdown = metrics.needsCheckBreakdown

  return (
    <section className="rounded-lg border border-violet-300 bg-violet-50/40 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-violet-950">needs_check root cause discovery (P0)</h2>
          <p className="mt-1 max-w-3xl text-sm text-violet-900">
            Workstreams A–D — discovery only. No ingestion repair implementation until dominant
            bottleneck and owner are evidence-backed.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
            discovery.discoveryComplete
              ? 'bg-emerald-100 text-emerald-900'
              : 'bg-amber-100 text-amber-900'
          }`}
        >
          Discovery {discovery.discoveryComplete ? 'complete' : 'in progress'}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-violet-800">needs_check</dt>
          <dd className="font-semibold tabular-nums">{discovery.needsCheck.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-violet-800">repair queue</dt>
          <dd className="font-semibold tabular-nums">
            {discovery.repairQueue?.toLocaleString() ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-violet-800">% of queue</dt>
          <dd className="font-semibold tabular-nums">
            {discovery.needsCheckPctOfRepairQueue != null
              ? pct(discovery.needsCheckPctOfRepairQueue)
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-violet-800">rows scanned</dt>
          <dd className="font-semibold tabular-nums">{analysis.scanned.toLocaleString()}</dd>
        </div>
      </dl>

      {discovery.dominantCategory && discovery.dominantOwner && (
        <div className="mt-4 rounded-md border border-violet-200 bg-white p-4 text-sm">
          <p className="font-semibold text-slate-900">Dominant bottleneck</p>
          <p className="mt-1">
            {CATEGORY_LABELS[discovery.dominantCategory]} → {OWNER_LABELS[discovery.dominantOwner]}
          </p>
          {discovery.repairScopeRecommendation && (
            <p className="mt-2 text-xs text-slate-600">{discovery.repairScopeRecommendation}</p>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-violet-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Workstream B — Blocker categories</h3>
          <ul className="mt-2 space-y-1 text-xs">
            {discovery.blockerCategories
              .filter((row) => row.count > 0)
              .map((row) => (
                <li key={row.category} className="flex justify-between gap-2 tabular-nums">
                  <span>{CATEGORY_LABELS[row.category]}</span>
                  <span>
                    {row.count.toLocaleString()} ({pct(row.pct)})
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            ≥80% explained by:{' '}
            {discovery.explainingCategories.map((c) => CATEGORY_LABELS[c]).join(', ') || '—'} (
            {pct(discovery.explainingCategoriesPct)})
          </p>
        </div>

        <div className="rounded-md border border-violet-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Workstream C — Owners</h3>
          <ul className="mt-2 space-y-1 text-xs">
            {discovery.owners
              .filter((row) => row.count > 0)
              .map((row) => (
                <li key={row.owner} className="flex justify-between gap-2 tabular-nums">
                  <span>{OWNER_LABELS[row.owner]}</span>
                  <span>
                    {row.count.toLocaleString()} ({pct(row.pctNeedsCheck)}
                    {row.pctRepairQueue != null ? ` · ${pct(row.pctRepairQueue)} queue` : ''})
                  </span>
                </li>
              ))}
          </ul>
        </div>

        <div className="rounded-md border border-violet-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Workstream A2 — Age profile</h3>
          <ul className="mt-2 space-y-1 text-xs tabular-nums">
            {discovery.ageBuckets.map((row) => (
              <li key={row.bucket} className="flex justify-between gap-2">
                <span>{row.label}</span>
                <span>
                  {row.count.toLocaleString()} ({pct(row.pct)})
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-violet-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Workstream A2 — Publishability</h3>
          <ul className="mt-2 space-y-1 text-xs tabular-nums">
            {discovery.publishability.map((row) => (
              <li key={row.profile} className="flex justify-between gap-2">
                <span>{row.profile}</span>
                <span>
                  {row.count.toLocaleString()} ({pct(row.pct)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {discovery.failureSignals.length > 0 && (
        <div className="mt-4 rounded-md border border-violet-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Failure signals (top 8)</h3>
          <ul className="mt-2 space-y-1 text-xs font-mono tabular-nums">
            {discovery.failureSignals.slice(0, 8).map((row) => (
              <li key={row.signal} className="flex justify-between gap-2">
                <span>{row.signal}</span>
                <span>
                  {row.count.toLocaleString()} ({pct(row.pct)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {breakdown && breakdown.total > 0 && (
        <div className="mt-4 rounded-md border border-violet-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Workstream A — Dashboard pairs (top 6)</h3>
          <ul className="mt-2 space-y-1 text-xs tabular-nums">
            {breakdown.topPairs.slice(0, 6).map((pair) => (
              <li key={`${pair.addressStatus}-${pair.coordinatePrecision}`}>
                {pair.addressStatus} × {pair.coordinatePrecision}: {pair.count.toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-4 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">Classification rules</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 font-mono text-[11px]">
          {discovery.classificationRulesSummary}
        </pre>
      </details>
    </section>
  )
}
