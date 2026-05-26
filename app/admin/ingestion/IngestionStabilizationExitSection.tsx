'use client'

import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { evaluateYstmStabilizationExit } from '@/lib/admin/ystmStabilizationExitCriteria'

const STATUS_STYLE = {
  pass: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  fail: 'border-red-300 bg-red-50 text-red-950',
  pending: 'border-slate-300 bg-slate-50 text-slate-700',
} as const

type Props = {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  onOpenDebug?: () => void
  onOpenControls?: () => void
}

function CriteriaList({
  title,
  ready,
  criteria,
}: {
  title: string
  ready: boolean
  criteria: ReturnType<typeof evaluateYstmStabilizationExit>['tier1Criteria']
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">
        {title}{' '}
        <span className={ready ? 'text-emerald-800' : 'text-amber-800'}>
          ({ready ? 'snapshot pass' : 'snapshot not met'})
        </span>
      </p>
      <ul className="mt-2 space-y-2">
        {criteria.map((item) => (
          <li
            key={item.id}
            className={`rounded border px-3 py-2 text-xs ${STATUS_STYLE[item.status]}`}
          >
            <span className="font-semibold uppercase">{item.status}</span>: {item.label} — {item.detail}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function IngestionStabilizationExitSection({
  metrics,
  coverage,
  onOpenDebug,
  onOpenControls,
}: Props) {
  const exit = evaluateYstmStabilizationExit(metrics, coverage)
  const duplicateClusters =
    coverage?.crossProviderConvergence.duplicatePublishedCanonicalClusters ?? 0
  const showClusterActions = duplicateClusters > 0 && onOpenDebug != null
  const showWorkstreamsAction = !exit.tier1Ready && onOpenControls != null

  return (
    <section className="rounded-lg border border-violet-300 bg-violet-50/50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-violet-950">
          YSTM stabilization exit (before ES.net resume)
        </h2>
        {(showClusterActions || showWorkstreamsAction) && (
          <div className="flex flex-wrap gap-2">
            {showClusterActions && (
              <button
                type="button"
                onClick={onOpenDebug}
                className="rounded-md border border-fuchsia-600 bg-white px-3 py-1.5 text-sm font-medium text-fuchsia-950 hover:bg-fuchsia-50"
              >
                Debug: {duplicateClusters} cluster(s)
              </button>
            )}
            {showWorkstreamsAction && (
              <button
                type="button"
                onClick={onOpenControls}
                className="rounded-md border border-violet-600 bg-white px-3 py-1.5 text-sm font-medium text-violet-950 hover:bg-violet-50"
              >
                Controls: workstreams
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-sm text-violet-900">
        Tier 1 gates ES.net <strong>planning</strong>. Tier 2 gates aggressive ES.net scaling. Daily metrics
        can be tracked before Tier 2 is required for planning.
      </p>
      <p className="mt-2 text-xs text-violet-800">{exit.holdNote}</p>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <CriteriaList title="Tier 1" ready={exit.tier1Ready} criteria={exit.tier1Criteria} />
        <CriteriaList title="Tier 2" ready={exit.tier2Ready} criteria={exit.tier2Criteria} />
      </div>
    </section>
  )
}
