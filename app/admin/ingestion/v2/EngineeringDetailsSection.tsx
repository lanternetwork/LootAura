'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { DiagnosticsPerformanceCard } from '@/app/admin/ingestion/v2/DiagnosticsPerformanceCard'

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

export function EngineeringDetailsSection({ model }: { model: IngestionDiagnosticsModel }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-6 rounded-lg border border-slate-300 bg-slate-50 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-900">Engineering Details</span>
        <span className="text-xs text-slate-600">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-slate-200 p-4">
          <Panel title="Domain Health">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {model.domainHealth.map((domain) => (
                <div
                  key={domain.id}
                  className="rounded border border-gray-200 bg-gray-50 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{domain.label}</span>
                    <span className="text-xs uppercase">{domain.status}</span>
                  </div>
                  <p className="mt-1 text-gray-600">{domain.primaryReason}</p>
                  <p className="mt-1 text-xs text-gray-500">{domain.currentMetric}</p>
                  <p className="text-xs text-gray-500">{domain.recommendedAction}</p>
                </div>
              ))}
            </div>
          </Panel>

          {model.operatorActions.length > 1 ? (
            <Panel title="Additional Operator Actions">
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {model.operatorActions.slice(1).map((action) => (
                  <li key={action.issue}>
                    <span className="font-medium uppercase">{action.severity}</span>: {action.issue}
                    <br />
                    <span className="text-gray-600">{action.action}</span> (owner: {action.owner})
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {model.healthReasons.length > 1 ? (
            <Panel title="Health Reasons">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {model.healthReasons.map((reason) => (
                  <li key={reason.id}>{reason.label}</li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {model.primaryBottleneck.secondaryPressures.length > 0 ? (
            <Panel title="Bottleneck Secondary Pressures">
              <ul className="space-y-1 text-sm">
                {model.primaryBottleneck.secondaryPressures.map((pressure) => (
                  <li key={pressure.id}>
                    {pressure.label}: {pressure.count.toLocaleString()}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Trend Summary">
            <p className="text-sm text-gray-700">{model.trendSummary}</p>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Pipeline (24h)">
              <ul className="space-y-1 text-sm">
                {model.pipeline.map((stage) => (
                  <li key={stage.stage} className="flex justify-between">
                    <span>{stage.stage}</span>
                    <span className="tabular-nums font-medium">
                      {stage.count24h.toLocaleString()}
                    </span>
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

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Visibility (split + confidence)">
              <Stat
                label="published_not_visible total"
                value={model.visibility.publishedNotVisibleTotal}
              />
              <Stat
                label="Audited sample"
                value={`${model.visibility.auditedCount} (${model.visibility.auditedCoveragePct ?? '—'}%)`}
              />
              <Stat label="Classification" value={model.visibility.classificationMode} />
              <Stat label="Confidence" value={model.visibility.classificationConfidence} />
              <Stat label="Observation stale" value={model.visibility.observationStaleCount} />
              <Stat
                label="True visibility failure"
                value={model.visibility.trueVisibilityFailureCount}
              />
            </Panel>

            <Panel title="Duplicate Detection (split)">
              <Stat label="Canonical clusters" value={model.duplicates.canonicalPublishClusters} />
              <Stat
                label="Convergence streak"
                value={`${model.duplicates.convergenceStreakDays} / ${model.duplicates.convergenceStreakTargetDays}`}
              />
              <Stat
                label="Visible duplicate clusters"
                value={model.duplicates.visibleDuplicateClusters}
              />
              <Stat label="Shadow divergence" value={model.duplicates.shadowDivergenceCount} />
            </Panel>
          </div>

          <Panel title="Backlog & Queues">
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

          <Panel title="Scheduler & Cron Health">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">Job</th>
                  <th className="py-2">State</th>
                  <th className="py-2">Last success</th>
                  <th className="py-2">Mins since</th>
                  <th className="py-2">Telemetry</th>
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
                    <td className="max-w-[12rem] truncate py-2 text-xs text-gray-500">
                      {cron.telemetryUnavailableReason ?? '—'}
                    </td>
                    <td className="py-2">{cron.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {model.seoReadiness ? (
            <Panel title="SEO Readiness (separate from ingestion health)">
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
          ) : null}

          <p className="text-sm text-slate-700">
            Legacy forensic sections and rollout gates: use <strong>Copy Full Diagnostics</strong>.
            Legacy dashboard:{' '}
            <Link href="/admin/ingestion" className="text-indigo-700 underline">
              /admin/ingestion
            </Link>
          </p>

          <DiagnosticsPerformanceCard performance={model.performance} compact />
        </div>
      ) : null}
    </section>
  )
}
