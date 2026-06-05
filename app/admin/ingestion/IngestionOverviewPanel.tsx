'use client'

import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  buildFunnelSnapshot,
  buildOperationalPriorities,
  buildQueueHealthSummary,
  buildRuntimeStateLines,
  coverageTrendSummary,
  ingestionHealthSummary,
  type IngestionHealthState,
} from '@/lib/admin/ingestionDashboardOverview'
import IngestionStabilizationExitSection from '@/app/admin/ingestion/IngestionStabilizationExitSection'
import IngestionRepairProgramSection from '@/app/admin/ingestion/IngestionRepairProgramSection'
import SeoOperationalPanel from '@/app/admin/ingestion/SeoOperationalPanel'

const HEALTH_STYLE: Record<IngestionHealthState, string> = {
  healthy: 'border-emerald-400 bg-emerald-50 text-emerald-950',
  degraded: 'border-amber-400 bg-amber-50 text-amber-950',
  blocked: 'border-red-400 bg-red-50 text-red-950',
}

const SEVERITY_STYLE = {
  critical: 'border-red-300 bg-red-50',
  warning: 'border-amber-300 bg-amber-50',
  info: 'border-slate-200 bg-slate-50',
} as const

type Props = {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  coverageError: string | null
  onCopyDiagnostics: () => void
  copyState: 'idle' | 'copied' | 'error'
  copyDisabled: boolean
  copyRefreshing?: boolean
  onOpenDebug?: () => void
  onOpenControls?: () => void
}

export default function IngestionOverviewPanel({
  metrics,
  coverage,
  coverageError,
  onCopyDiagnostics,
  copyState,
  copyDisabled,
  copyRefreshing = false,
  onOpenDebug,
  onOpenControls,
}: Props) {
  const hero = ingestionHealthSummary(metrics, coverage)
  const funnel = buildFunnelSnapshot(metrics)
  const queues = buildQueueHealthSummary(metrics, coverage)
  const priorities = buildOperationalPriorities(metrics, coverage)
  const runtimeLines = buildRuntimeStateLines(coverage)

  return (
    <div className="space-y-6">
      <section className={`rounded-lg border p-5 shadow-sm ${HEALTH_STYLE[hero.health]}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">System health (Tier 1)</p>
            <p className="mt-1 text-2xl font-bold">{hero.healthLabel}</p>
            <p className="mt-1 text-sm font-medium">
              {hero.interventionRequired
                ? 'Intervention required — see priorities below or Debug.'
                : hero.tier1Ready
                  ? 'Tier 1 snapshot pass — continue 7-day hold in ops log.'
                  : 'Tier 1 snapshot not met — monitor; no immediate blockers.'}
            </p>
            <p className="mt-2 text-sm">
              Effective bottleneck: <span className="font-semibold">{hero.bottleneckLabel}</span>
              {hero.rawBottleneck !== hero.bottleneck && (
                <span className="opacity-80"> (metrics: {hero.rawBottleneck.replace(/_/g, ' ')})</span>
              )}
            </p>
            <p className="mt-1 text-sm">{hero.coverageLine}</p>
            <p className="text-sm">{hero.convergenceLine}</p>
            {hero.bootstrapAdvisories.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {hero.bootstrapAdvisories.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={onCopyDiagnostics}
            disabled={copyDisabled}
            className="rounded-md border border-indigo-400 bg-white px-4 py-2 text-sm font-medium text-indigo-900 shadow-sm hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copyRefreshing
              ? 'Refreshing coverage…'
              : copyState === 'copied'
                ? 'Copied'
                : copyState === 'error'
                  ? 'Copy failed'
                  : 'Copy diagnostics'}
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs opacity-80">Repair queue</dt>
            <dd className="text-lg font-semibold tabular-nums">{queues.catalogRepair.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-80">Address enrichment</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {queues.addressEnrichment.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs opacity-80">Publish failed</dt>
            <dd className="text-lg font-semibold tabular-nums">{queues.publishFailed.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs opacity-80">Geocode eligible</dt>
            <dd className="text-lg font-semibold tabular-nums">{queues.geocodeEligible.toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <IngestionStabilizationExitSection
        metrics={metrics}
        coverage={coverage}
        onOpenDebug={onOpenDebug}
        onOpenControls={onOpenControls}
      />

      <IngestionRepairProgramSection
        metrics={metrics}
        coverage={coverage}
        onOpenControls={onOpenControls}
      />

      <SeoOperationalPanel metrics={metrics} coverage={coverage} />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Active runtime state</h2>
        <p className="mt-1 text-sm text-slate-600">DB-backed toggles and convergence SLO (from coverage API).</p>
        {coverageError && (
          <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {coverageError}
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {runtimeLines.map((line) => (
            <li
              key={line.label}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-slate-800">{line.label}</span>
              <span
                className={
                  line.tone === 'on'
                    ? 'font-semibold text-emerald-800'
                    : line.tone === 'warn'
                      ? 'font-semibold text-amber-800'
                      : line.tone === 'off'
                        ? 'text-slate-600'
                        : 'text-slate-700'
                }
              >
                {line.value}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Operational priorities</h2>
        <ol className="mt-3 space-y-3">
          {priorities.map((item, index) => (
            <li
              key={`${item.issue}-${index}`}
              className={`rounded-md border p-3 text-sm ${SEVERITY_STYLE[item.severity]}`}
            >
              <p className="font-semibold capitalize text-slate-900">
                {item.severity}: {item.issue}
              </p>
              <p className="mt-1 text-slate-700">{item.suggestedAction}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Throughput snapshot (24h)</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Discovered</dt>
              <dd className="text-xl font-semibold tabular-nums">{funnel.discovered.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Inserted</dt>
              <dd className="text-xl font-semibold tabular-nums">{funnel.inserted.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Published</dt>
              <dd className="text-xl font-semibold tabular-nums">{funnel.published.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Publish failed</dt>
              <dd className="text-xl font-semibold tabular-nums">{funnel.publishFailed.toLocaleString()}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Top dropoff</dt>
              <dd className="font-medium">
                {funnel.topDropoffLabel} ({funnel.topDropoffCount.toLocaleString()})
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Insert yield (24h)</dt>
              <dd className="font-medium">
                {funnel.insertYield24h == null ? '—' : `${(funnel.insertYield24h * 100).toFixed(2)}%`}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-emerald-950">Coverage + convergence</h2>
          {coverage ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-emerald-900">Coverage</dt>
                <dd className="font-semibold tabular-nums">
                  {coverage.coveragePct?.toFixed(1) ?? '—'}% · {coverageTrendSummary(coverage)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-emerald-900">Valid active (V)</dt>
                <dd className="font-semibold tabular-nums">{coverage.validActiveYstmUrls.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-emerald-900">Missing valid URLs</dt>
                <dd className="font-semibold tabular-nums">{coverage.missingValidYstmUrls.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-emerald-900">Duplicate canonical clusters</dt>
                <dd className="font-semibold tabular-nums">
                  {coverage.crossProviderConvergence.duplicatePublishedCanonicalClusters}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-emerald-900">Shadow observations (24h)</dt>
                <dd className="font-semibold tabular-nums">
                  {coverage.crossProviderShadow.shadowRecords24h}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-emerald-900">Coverage metrics unavailable.</p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Queue health</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Catalog repair</dt>
            <dd className="font-semibold tabular-nums">{queues.catalogRepair.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Missing ingest</dt>
            <dd className="font-semibold tabular-nums">{queues.missingIngest.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Refresh stale</dt>
            <dd className="font-semibold tabular-nums">{queues.refreshStale.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Needs check</dt>
            <dd className="font-semibold tabular-nums">{queues.needsCheck.toLocaleString()}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
