'use client'

import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'

type Props = {
  metrics: IngestionMetricsResponse
}

function pct(count: number, total: number): string {
  return total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '0.0%'
}

export default function AddressEnrichmentDrainSection({ metrics }: Props) {
  const analysis = metrics.addressEnrichmentDrainCohort
  if (!analysis || analysis.total === 0) {
    return null
  }

  return (
    <section className="rounded-lg border border-teal-300 bg-teal-50/40 p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-teal-950">Address enrichment drain repair (P0)</h2>
        <p className="mt-1 max-w-3xl text-sm text-teal-900">
          Workstreams A–B for <code className="font-mono text-xs">address_enrichment_pending × provider_native</code>{' '}
          — lifecycle convergence without quality gate changes.
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-teal-800">cohort rows</dt>
          <dd className="font-semibold tabular-nums">{analysis.total.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-teal-800">dominant failure</dt>
          <dd className="font-mono text-xs font-semibold">{analysis.dominantFailureSubtype ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-teal-800">scanned</dt>
          <dd className="font-semibold tabular-nums">{analysis.scanned.toLocaleString()}</dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-teal-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Workstream A — Classification</h3>
          <ul className="mt-2 space-y-1 text-xs tabular-nums">
            {Object.entries(analysis.byClassification)
              .filter(([, count]) => count > 0)
              .map(([key, count]) => (
                <li key={key} className="flex justify-between gap-2">
                  <span className="font-mono">{key}</span>
                  <span>
                    {count.toLocaleString()} ({pct(count, analysis.total)})
                  </span>
                </li>
              ))}
          </ul>
        </div>

        <div className="rounded-md border border-teal-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Workstream B — Failure subtypes</h3>
          <ul className="mt-2 space-y-1 text-xs tabular-nums">
            {Object.entries(analysis.byFailureSubtype)
              .filter(([, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <li key={key} className="flex justify-between gap-2">
                  <span className="font-mono">{key}</span>
                  <span>
                    {count.toLocaleString()} ({pct(count, analysis.total)})
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
