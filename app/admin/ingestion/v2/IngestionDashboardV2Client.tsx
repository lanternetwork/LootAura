'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { formatSystemHealthLabel } from '@/lib/admin/diagnostics/v4/systemHealth'
import { buildDiagnosticsExport } from '@/lib/admin/diagnostics/v4/export/buildDiagnosticsExport'
import { copyTextToClipboard } from '@/lib/admin/copyTextToClipboard'

type ModelResponse = {
  ok: boolean
  model?: IngestionDiagnosticsModel
  message?: string
}

const HEALTH_STYLE = {
  healthy: 'border-emerald-400 bg-emerald-50 text-emerald-950',
  degraded: 'border-amber-400 bg-amber-50 text-amber-950',
  critical: 'border-red-400 bg-red-50 text-red-950',
} as const

type CopyMode = 'operations' | 'engineering' | 'full'

export default function IngestionDashboardV2Client() {
  const [model, setModel] = useState<IngestionDiagnosticsModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [engineeringOpen, setEngineeringOpen] = useState(false)
  const [copyState, setCopyState] = useState<CopyMode | 'error' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ingestion/diagnostics-model', { credentials: 'include' })
      const json = (await res.json()) as ModelResponse
      if (!res.ok || !json.ok || !json.model) {
        throw new Error(json.message || `HTTP ${res.status}`)
      }
      setModel(json.model)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyReport = useCallback(
    async (mode: CopyMode) => {
      if (!model) return
      try {
        await copyTextToClipboard(buildDiagnosticsExport(model, mode))
        setCopyState(mode)
        window.setTimeout(() => setCopyState(null), 2000)
      } catch {
        setCopyState('error')
        window.setTimeout(() => setCopyState(null), 4000)
      }
    },
    [model]
  )

  if (loading && !model) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 text-center text-gray-600">
        Loading diagnostics model…
      </div>
    )
  }

  if (error && !model) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-700">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded border px-3 py-2">
          Retry
        </button>
      </div>
    )
  }

  if (!model) return null

  const healthClass = HEALTH_STYLE[model.systemHealth]

  return (
    <div className="min-h-screen bg-gray-50 py-8 text-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Ingestion (v2)</h1>
            <p className="mt-1 text-sm text-gray-600">
              Production operations dashboard · model {model.diagnosticsModelVersion}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/ingestion"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
            >
              Legacy dashboard
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        <section className={`mb-6 rounded-lg border p-5 shadow-sm ${healthClass}`}>
          <h2 className="text-lg font-semibold">System Health</h2>
          <p className="mt-2 text-2xl font-bold">{formatSystemHealthLabel(model.systemHealth)}</p>
          <p className="mt-1 text-sm">
            Primary bottleneck: <strong>{model.primaryBottleneck.label}</strong> —{' '}
            {model.primaryBottleneck.reason}
          </p>
          <p className="text-sm">Trend: {model.trendSummary}</p>
          <p className="text-xs opacity-70">Last refresh: {new Date(model.generatedAt).toLocaleString()}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {(['operations', 'engineering', 'full'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void copyReport(mode)}
                className="rounded-md border border-indigo-400 bg-white px-3 py-1.5 text-sm font-medium text-indigo-900 hover:bg-indigo-50"
              >
                {copyState === mode
                  ? 'Copied'
                  : copyState === 'error'
                    ? 'Copy failed'
                    : `Copy ${mode === 'operations' ? 'Operations' : mode === 'engineering' ? 'Engineering' : 'Full'} Report`}
              </button>
            ))}
          </div>
        </section>

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Panel title="Top Operator Actions">
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {model.operatorActions.map((action) => (
                <li key={action.issue}>
                  <span className="font-medium uppercase">{action.severity}</span>: {action.issue}
                  <br />
                  <span className="text-gray-600">{action.action}</span> (owner: {action.owner})
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Active Alerts">
            {model.alerts.length === 0 ? (
              <p className="text-sm text-gray-600">No active alerts</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {model.alerts.map((alert) => (
                  <li key={alert.id} className="rounded border border-gray-200 bg-white p-2">
                    <span className="font-medium uppercase">{alert.severity}</span>: {alert.reason}
                    <p className="text-gray-600">{alert.recommendedAction}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="SLOs">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">SLO</th>
                <th className="py-2">Status</th>
                <th className="py-2">Actual</th>
                <th className="py-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {model.slos.map((slo) => (
                <tr key={slo.id} className="border-b border-gray-100">
                  <td className="py-2">{slo.label}</td>
                  <td className="py-2">{slo.pass ? 'PASS' : 'FAIL'}</td>
                  <td className="py-2 tabular-nums">{slo.actual}</td>
                  <td className="py-2 tabular-nums">{slo.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Panel title="Pipeline (24h)">
            <ul className="space-y-1 text-sm">
              {model.pipeline.map((stage) => (
                <li key={stage.stage} className="flex justify-between">
                  <span>{stage.stage}</span>
                  <span className="tabular-nums font-medium">{stage.count24h.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Catalog Repair">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Queue total" value={model.catalogRepair.queueTotal} />
              <Stat label="needs_check" value={model.catalogRepair.needsCheck} />
              <Stat label="needs_geocode" value={model.catalogRepair.needsGeocode} />
              <Stat label="publish_failed" value={model.catalogRepair.publishFailed} />
              <Stat label="repair_failed" value={model.catalogRepair.repairFailed} />
              <Stat label="address enrichment" value={model.catalogRepair.addressEnrichment} />
            </dl>
            <p className="mt-2 text-sm">
              Dominant blocker: {model.catalogRepair.dominantBlocker ?? '—'}
            </p>
            <p className="text-sm text-gray-600">{model.catalogRepair.recommendation}</p>
          </Panel>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Panel title="Visibility (split)">
            <Stat label="Observation stale" value={model.visibility.observationStale} />
            <Stat label="True visibility failure" value={model.visibility.trueVisibilityFailure} />
            <Stat label="published_not_visible total" value={model.visibility.publishedNotVisibleTotal} />
          </Panel>

          <Panel title="Duplicate Detection (split)">
            <Stat label="Canonical clusters" value={model.duplicates.canonicalPublishClusters} />
            <Stat
              label="Convergence streak"
              value={`${model.duplicates.convergenceStreakDays} / ${model.duplicates.convergenceStreakTargetDays}`}
            />
            <Stat label="Visible duplicate clusters" value={model.duplicates.visibleDuplicateClusters} />
            <Stat
              label="Shadow divergence"
              value={model.duplicates.shadowDivergenceCount}
            />
          </Panel>
        </div>

        <Panel title="Backlog & Queues" className="mt-6">
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Catalog repair" value={model.backlogs.catalogRepair} />
            <Stat label="Geocode eligible" value={model.backlogs.geocodeEligible} />
            <Stat label="Address enrichment" value={model.backlogs.addressEnrichment} />
            <Stat label="Refresh stale" value={model.backlogs.refreshStale} />
            <Stat label="Missing ingest" value={model.backlogs.missingIngest} />
            <Stat label="Image backlog" value={model.backlogs.imageBacklog} />
            <Stat label="Publish failed" value={model.backlogs.publishFailed} />
          </dl>
        </Panel>

        <Panel title="Scheduler & Cron Health" className="mt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2">Job</th>
                <th className="py-2">State</th>
                <th className="py-2">Last success</th>
                <th className="py-2">Mins since</th>
                <th className="py-2">Owner</th>
              </tr>
            </thead>
            <tbody>
              {model.schedulerCrons.map((cron) => (
                <tr key={cron.id} className="border-b border-gray-100">
                  <td className="py-2">{cron.displayName}</td>
                  <td className="py-2">{cron.state}</td>
                  <td className="py-2 font-mono text-xs">
                    {cron.lastSuccessAt ? new Date(cron.lastSuccessAt).toLocaleString() : '—'}
                  </td>
                  <td className="py-2 tabular-nums">{cron.minutesSinceSuccess ?? '—'}</td>
                  <td className="py-2">{cron.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {model.seoReadiness && (
          <Panel title="SEO Readiness (separate from ingestion health)" className="mt-6">
            <p className="mb-2 text-sm">
              Metric gate: {model.seoReadiness.metricGatePass ? 'PASS' : 'FAIL'}
            </p>
            <ul className="space-y-1 text-sm">
              {model.seoReadiness.criteria.map((row) => (
                <li key={row.label}>
                  [{row.pass ? 'PASS' : 'FAIL'}] {row.label}: {row.actual}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <section className="mt-6 rounded-lg border border-slate-300 bg-slate-50 p-4">
          <button
            type="button"
            onClick={() => setEngineeringOpen((v) => !v)}
            className="text-sm font-semibold text-slate-900"
          >
            {engineeringOpen ? '▼' : '▶'} Engineering Diagnostics (lazy)
          </button>
          {engineeringOpen && (
            <p className="mt-2 text-sm text-slate-700">
              Use <strong>Copy Full Diagnostics</strong> for rollout gates, shadow replay, and legacy
              forensic sections. Legacy dashboard remains at{' '}
              <Link href="/admin/ingestion" className="text-indigo-700 underline">
                /admin/ingestion
              </Link>{' '}
              until parity sign-off.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`.trim()}
    >
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
