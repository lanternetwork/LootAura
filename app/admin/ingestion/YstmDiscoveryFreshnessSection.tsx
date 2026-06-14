'use client'

import type { YstmDiscoveryFreshnessMetrics } from '@/lib/ingestion/ystmCoverage/discoveryFreshness/loadYstmDiscoveryFreshnessMetrics'

function formatHours(value: number | null): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}h`
}

function formatPct(value: number | null): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

type Props = {
  data: YstmDiscoveryFreshnessMetrics
}

export default function YstmDiscoveryFreshnessSection({ data }: Props) {
  const discovery = data.discoveryLatencyHours
  const publish = data.publishLatencyHours

  return (
    <div className="mb-4 rounded-md border border-cyan-300 bg-cyan-50 p-4">
      <h3 className="text-sm font-semibold text-cyan-950">National discovery freshness</h3>
      <p className="mt-1 text-xs text-cyan-900">
        Listing-level latency (DISCOVERY_FRESHNESS_PROGRAM_V2). Target: discovery p95 ≤ 4h, publish p95 ≤
        4h for comparable listings.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-cyan-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-600">Discovery p50 / p90 / p95</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            {formatHours(discovery.p50)} / {formatHours(discovery.p90)} / {formatHours(discovery.p95)}
          </p>
          <p className="text-xs text-slate-500">n={discovery.sampleCount}</p>
        </div>
        <div className="rounded border border-cyan-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-600">Publish p50 / p90 / p95</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            {formatHours(publish.p50)} / {formatHours(publish.p90)} / {formatHours(publish.p95)}
          </p>
          <p className="text-xs text-slate-500">n={publish.sampleCount}</p>
        </div>
        <div className="rounded border border-cyan-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-600">Comparable listings</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            {data.comparableListingCount.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500">
            telemetry {formatPct(data.telemetryCompletenessPct)} · proxy {formatPct(data.proxyAppearancePct)}
          </p>
        </div>
        <div className="rounded border border-cyan-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-600">Velocity pools (configs)</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            HOT {data.velocityPoolCounts.HOT} · WARM {data.velocityPoolCounts.WARM} · COLD{' '}
            {data.velocityPoolCounts.COLD}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-cyan-200 bg-white px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">Config inventory</p>
          <p className="mt-1">
            ACTIVE {data.configInventoryByClass.ACTIVE.toLocaleString()} · LOW{' '}
            {data.configInventoryByClass.LOW_ACTIVITY.toLocaleString()} · DORMANT{' '}
            {data.configInventoryByClass.DORMANT.toLocaleString()} · DEAD{' '}
            {data.configInventoryByClass.DEAD.toLocaleString()}
          </p>
          <p className="mt-1 text-slate-500">
            crawlable {data.crawlableConfigCount.toLocaleString()} · 50% listings in top{' '}
            {data.concentration.configsFor50PctListings} configs
          </p>
        </div>
        <div className="rounded border border-cyan-200 bg-white px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">Capacity plan (checks/day)</p>
          <ul className="mt-1 space-y-1">
            {data.capacityPlan.map((row) => (
              <li key={row.target}>
                {row.target}: need {row.requiredChecksPerDay.toLocaleString()} · current{' '}
                {row.currentChecksPerDay.toLocaleString()}
                {row.gapChecksPerDay > 0 ? (
                  <span className="text-amber-800"> · gap {row.gapChecksPerDay.toLocaleString()}</span>
                ) : (
                  <span className="text-emerald-800"> · OK</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
