'use client'

import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  evaluateYstmIngestionRepairProgram,
  type RepairWorkstreamStatus,
} from '@/lib/admin/evaluateYstmIngestionRepairProgram'

const STATUS_STYLE: Record<RepairWorkstreamStatus, string> = {
  blocked: 'border-red-300 bg-red-50 text-red-950',
  ready: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  watch: 'border-amber-300 bg-amber-50 text-amber-950',
  info: 'border-slate-200 bg-slate-50 text-slate-800',
}

type Props = {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  onOpenControls?: () => void
}

export default function IngestionRepairProgramSection({ metrics, coverage, onOpenControls }: Props) {
  const program = evaluateYstmIngestionRepairProgram(metrics, coverage)
  const breakdown = metrics.needsCheckBreakdown

  return (
    <section className="rounded-lg border border-indigo-300 bg-indigo-50/40 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-indigo-950">
            YSTM ingestion repair program (SEO allowlist unblock)
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-indigo-900">
            Workstreams A–G from the repair spec. Tier 1 snapshot must pass with a{' '}
            <strong>7-day hold</strong> before SEO allowlist (L) can unlock indexing prep. Inventory
            emission stays fail-closed until gate R passes (post-#531).
          </p>
          <p className="mt-2 text-xs text-indigo-800">{program.holdNote}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
              program.tier1Ready ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'
            }`}
          >
            Tier 1 {program.tier1Ready ? 'pass' : 'not met'}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
              program.tier2RepairReady ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
            }`}
          >
            Tier 2 repair {program.tier2RepairReady ? 'pass' : 'pending'}
          </span>
          {onOpenControls && (
            <button
              type="button"
              onClick={onOpenControls}
              className="rounded-md border border-indigo-600 bg-white px-3 py-1.5 text-sm font-medium text-indigo-950 hover:bg-indigo-50"
            >
              Controls: workstreams
            </button>
          )}
        </div>
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

      {coverage && program.falseExclusionBuckets.length > 0 && (
        <div className="mt-6 rounded-md border border-indigo-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">False-exclusion buckets (Workstream C)</h3>
          <p className="mt-1 text-xs text-slate-600">
            Primary bucket per missing valid URL — {coverage.missingValidYstmUrls.toLocaleString()}{' '}
            missing total.
          </p>
          <ul className="mt-3 space-y-2">
            {program.falseExclusionBuckets.slice(0, 8).map((row) => (
              <li
                key={row.bucket}
                className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800"
              >
                <span className="font-mono font-semibold">{row.bucket}</span>
                <span className="ml-2 tabular-nums">{row.count.toLocaleString()}</span>
                <span className="mt-1 block text-slate-600">{row.action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {breakdown && breakdown.total > 0 && (
        <div className="mt-6 rounded-md border border-indigo-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">needs_check breakdown (Workstream B)</h3>
          <p className="mt-1 text-xs text-slate-600">
            {breakdown.total.toLocaleString()} rows scanned — triage 2×/week per repair runbook.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">By address_status</p>
              <ul className="mt-2 space-y-1 text-xs">
                {Object.entries(breakdown.byAddressStatus)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <li key={status} className="flex justify-between gap-2 tabular-nums">
                      <span className="font-mono">{status}</span>
                      <span>{count.toLocaleString()}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">By coordinate_precision</p>
              <ul className="mt-2 space-y-1 text-xs">
                {Object.entries(breakdown.byCoordinatePrecision)
                  .sort((a, b) => b[1] - a[1])
                  .map(([precision, count]) => (
                    <li key={precision} className="flex justify-between gap-2 tabular-nums">
                      <span className="font-mono">{precision}</span>
                      <span>{count.toLocaleString()}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          {breakdown.topPairs.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Top pairs</p>
              <ul className="mt-2 space-y-1 text-xs tabular-nums">
                {breakdown.topPairs.slice(0, 6).map((pair) => (
                  <li key={`${pair.addressStatus}-${pair.coordinatePrecision}`}>
                    {pair.addressStatus} × {pair.coordinatePrecision}: {pair.count.toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
