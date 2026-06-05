'use client'

import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  evaluateYstmIngestionRepairProgram,
  type RepairWorkstreamStatus,
} from '@/lib/admin/evaluateYstmIngestionRepairProgram'

type Props = {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  onOpenDebug?: () => void
}

const STATUS_STYLE: Record<RepairWorkstreamStatus, string> = {
  blocked: 'border-red-300 bg-red-50 text-red-950',
  ready: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  watch: 'border-amber-300 bg-amber-50 text-amber-950',
  info: 'border-slate-200 bg-slate-50 text-slate-800',
}

export default function IngestionWorkstreamsPanel({ metrics, coverage, onOpenDebug }: Props) {
  const program = evaluateYstmIngestionRepairProgram(metrics, coverage)

  return (
    <section className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Repair program workstreams (A–G)</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Operator sequence from the YSTM ingestion repair program (PR #532). Tier 1 exit gates are on
            Overview; telemetry is in Debug.
          </p>
          {coverage && (
            <p className="mt-2 text-xs text-slate-500">
              Missing valid URLs: {coverage.missingValidYstmUrls.toLocaleString()}
              {coverage.coveragePct != null ? ` · Coverage: ${coverage.coveragePct.toFixed(1)}%` : ''}
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
        {program.workstreams.map((card) => (
          <li
            key={card.id}
            className={`rounded-md border px-4 py-3 text-sm ${STATUS_STYLE[card.status]}`}
          >
            <p className="font-semibold">
              {card.id}. {card.title}{' '}
              <span className="font-normal opacity-75">({card.priority})</span>
            </p>
            <p className="mt-1 tabular-nums">{card.metric}</p>
            <p className="mt-2 text-xs opacity-90">{card.action}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
