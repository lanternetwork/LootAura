'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

const POLL_MS = 30_000

function formatPct(value: number | null): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function Metric(props: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={
        props.highlight
          ? 'rounded border border-amber-200 bg-amber-50 px-3 py-2'
          : 'rounded border border-slate-200 bg-white px-3 py-2'
      }
    >
      <p className="text-xs text-slate-600">{props.label}</p>
      <p className="text-lg font-semibold tabular-nums">{props.value.toLocaleString()}</p>
    </div>
  )
}

export default function YstmCoverageScoreboardSection() {
  const [data, setData] = useState<YstmCoverageMetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ingestion/ystm-coverage', { credentials: 'include' })
      const json = (await res.json()) as YstmCoverageMetricsResponse & { code?: string; message?: string }
      if (!res.ok || !json.ok) {
        throw new Error(json.message || `HTTP ${res.status}`)
      }
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  const trendData =
    data?.trend.map((p) => ({
      label: formatWhen(p.completedAt),
      coverage: p.coveragePct,
      valid: p.validActiveYstmUrls,
      visible: p.publishedVisibleInAudit,
    })) ?? []

  const missingStateRows = Object.entries(data?.missingByState ?? {}).sort((a, b) => b[1] - a[1])
  const missingMetroRows = Object.entries(data?.missingByMetro ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <section className="mb-8 rounded-lg border border-emerald-300 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-emerald-950">YSTM nationwide coverage</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Product goal: published active LootAura YSTM sales visible on the map ÷ valid active YSTM sales from
            bounded audits. Not crawl discovered/skipped counts.
          </p>
        </div>
        <p className="text-xs text-gray-500">Last audit: {formatWhen(data?.lastAuditAt ?? null)}</p>
      </div>

      {loading && !data && <p className="text-sm text-gray-500">Loading coverage scoreboard…</p>}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {data && (
        <>
          {!data.operationalHealth.healthy && data.operationalHealth.alerts.length > 0 && (
            <div className="mb-4 space-y-2">
              {data.operationalHealth.alerts.map((alert) => (
                <p
                  key={alert.code}
                  className={`rounded border px-3 py-2 text-sm font-medium ${
                    alert.level === 'critical'
                      ? 'border-red-500 bg-red-100 text-red-950'
                      : 'border-amber-500 bg-amber-100 text-amber-950'
                  }`}
                >
                  {alert.level === 'critical' ? 'Critical' : 'Warning'}: {alert.message}
                </p>
              ))}
            </div>
          )}

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">Coverage</p>
              <p className="mt-1 text-3xl font-bold text-emerald-950">{formatPct(data.coveragePct)}</p>
              <p className="mt-1 text-xs text-emerald-900">Target {data.targetPct}%</p>
            </div>
            <div className="rounded-md border border-gray-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Valid active YSTM (audit)</p>
              <p className="mt-1 text-2xl font-semibold">{data.validActiveYstmUrls.toLocaleString()}</p>
              <p className="mt-1 text-xs text-gray-500">
                Footprint {data.observationFootprintUrls.toLocaleString()} URLs observed
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
                Published active LootAura
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {data.publishedActiveLootAuraYstmUrls.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {data.publishedVisibleInAuditFootprint.toLocaleString()} visible in audit footprint
              </p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-900">Missing valid YSTM</p>
              <p className="mt-1 text-2xl font-semibold text-amber-950">
                {data.missingValidYstmUrls.toLocaleString()}
              </p>
            </div>
          </div>

          <div
            className={`mb-6 rounded-md border p-4 ${
              data.sloAttainment.programComplete
                ? 'border-emerald-400 bg-emerald-100'
                : 'border-indigo-300 bg-indigo-50'
            }`}
          >
            <h3 className="text-sm font-semibold text-indigo-950">Phase 7 — G4 program completion</h3>
            <p className="mt-1 text-xs text-indigo-900">
              Requires {data.sloAttainment.requiredConsecutiveDays} consecutive UTC days with coverage ≥
              {data.targetPct}% (last audit of each day), current footprint ≥
              {data.sloAttainment.programMinFootprint.toLocaleString()} valid-active URLs, and no critical
              coverage alerts.
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <p>
                <span className="font-medium">Hold streak:</span>{' '}
                {data.sloAttainment.consecutiveDaysAtTarget} /{' '}
                {data.sloAttainment.requiredConsecutiveDays} days
              </p>
              <p>
                <span className="font-medium">Footprint:</span>{' '}
                {data.sloAttainment.footprintMeetsProgramMinimum ? 'meets' : 'below'} program minimum (
                {data.validActiveYstmUrls.toLocaleString()} valid-active)
              </p>
              <p>
                <span className="font-medium">Status:</span>{' '}
                {data.sloAttainment.programComplete
                  ? 'Program complete (G4)'
                  : data.sloAttainment.latestDayQualifies
                    ? 'At target today — sustain hold'
                    : 'Not at target on latest audit day'}
              </p>
            </div>
          </div>

          {data.lastRun && (
            <p className="mb-4 text-xs text-gray-600">
              Last audit: {data.lastRun.listPagesFetched} list pages · {data.lastRun.listingUrlsDiscovered}{' '}
              URLs discovered · {data.lastRun.detailPagesValidated} detail checks · config cursor{' '}
              {data.lastRun.configCursorAfter}
            </p>
          )}

          <div className="mb-6 rounded-md border border-indigo-200 bg-indigo-50 p-4">
            <h3 className="text-sm font-semibold text-indigo-950">Pipeline backlog (Phase 7 SLO)</h3>
            <p className="mt-1 text-xs text-indigo-900">
              Work queues that must drain for coverage to reach {data.targetPct}% — distinct from crawl
              discovered/skipped counts.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric
                label="Missing valid YSTM"
                value={data.pipelineBacklog.missingValidUrls}
                highlight
              />
              <Metric
                label="Missing ingest queue"
                value={data.pipelineBacklog.missingIngestionQueue}
              />
              <Metric
                label="Never attempted"
                value={data.pipelineBacklog.missingIngestionNeverAttempted}
              />
              <Metric label="Catalog repair" value={data.pipelineBacklog.catalogRepairQueue} />
              <Metric label="Stale refresh" value={data.pipelineBacklog.existingRefreshStale} />
            </div>
          </div>

          <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 p-4">
            <h3 className="text-sm font-semibold text-rose-950">Catalog repair (Phase 5)</h3>
            <p className="mt-1 text-xs text-rose-900">
              Re-processes stuck YSTM ingested_sales (needs_check, publish_failed, coord gaps) via
              detail-first refresh, then geocode and publish when eligible.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Repair queue" value={data.catalogRepair.repairQueueTotal} highlight />
              <Metric label="Needs geocode" value={data.catalogRepair.needsGeocode} />
              <Metric label="Publish failed" value={data.catalogRepair.publishFailed} />
              <Metric label="Needs check" value={data.catalogRepair.needsCheck} />
            </div>
            <p className="mt-2 text-xs text-rose-800">
              Published via repair (24h): {data.catalogRepair.repairedPublishedLast24h.toLocaleString()}{' '}
              · ready unpublished: {data.catalogRepair.readyUnpublished.toLocaleString()} · repair
              failed: {data.catalogRepair.repairFailed.toLocaleString()}
            </p>
          </div>

          <div className="mb-6 rounded-md border border-sky-200 bg-sky-50 p-4">
            <h3 className="text-sm font-semibold text-sky-950">Existing URL refresh (Phase 4)</h3>
            <p className="mt-1 text-xs text-sky-900">
              Re-fetches YSTM detail pages for known ingested_sales to sync dates, content, and publish state.
              Stale threshold defaults to 12h since last source sync.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="YSTM ingested corpus" value={data.existingRefresh.ystmDetailIngestedTotal} />
              <Metric label="Stale (&gt;12h)" value={data.existingRefresh.staleOver12h} highlight />
              <Metric label="Synced last 24h" value={data.existingRefresh.syncedLast24h} />
              <Metric label="Never synced" value={data.existingRefresh.neverSynced} />
            </div>
          </div>

          <div className="mb-6 rounded-md border border-violet-200 bg-violet-50 p-4">
            <h3 className="text-sm font-semibold text-violet-950">Missing URL ingestion (Phase 3)</h3>
            <p className="mt-1 text-xs text-violet-900">
              Daily cron ingests valid YSTM URLs from the coverage audit footprint via detail-first + publish.
              Queue rotates by canonical URL offset.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Missing queue" value={data.missingIngestion.missingQueueTotal} highlight />
              <Metric
                label="Never attempted"
                value={data.missingIngestion.missingIngestionNeverAttempted}
              />
              <Metric
                label="Published via queue"
                value={data.missingIngestion.missingIngestionPublished}
              />
              <Metric label="Failed / retry later" value={data.missingIngestion.missingIngestionFailed} />
            </div>
            <p className="mt-2 text-xs text-violet-800">
              Attempted {data.missingIngestion.missingIngestionAttempted.toLocaleString()} · ingested{' '}
              {data.missingIngestion.missingIngestionIngested.toLocaleString()} · skipped existing{' '}
              {data.missingIngestion.missingIngestionSkippedExisting.toLocaleString()} · skipped already
              visible {data.missingIngestion.missingIngestionSkippedVisible.toLocaleString()}
            </p>
          </div>

          <div className="mb-6 rounded-md border border-teal-200 bg-teal-50 p-4">
            <h3 className="text-sm font-semibold text-teal-950">YSTM graph enumeration</h3>
            <p className="mt-1 text-xs text-teal-900">
              Nationwide city/list registry build (evolved discovery cron). Feeds crawlable configs for
              ingestion and coverage — not a separate publish path.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Catalog states" value={data.graphEnumeration.catalogStates} />
              <Metric label="States w/ candidates" value={data.graphEnumeration.statesWithCandidates} />
              <Metric label="Candidates total" value={data.graphEnumeration.candidatesDiscovered} highlight />
              <Metric label="Pending validation" value={data.graphEnumeration.pendingValidation} />
              <Metric label="Validated pages" value={data.graphEnumeration.validatedPages} />
              <Metric label="Promoted candidates" value={data.graphEnumeration.promotedCandidates} />
              <Metric label="Crawlable configs" value={data.graphEnumeration.sourceExpansion.crawlableConfigs} />
              <Metric
                label="No source pages"
                value={data.graphEnumeration.sourceExpansion.configsWithoutSourcePages}
                highlight
              />
            </div>
            <p className="mt-2 text-xs text-teal-800">
              Validations (24h): {data.graphEnumeration.validationsLast24h.toLocaleString()} · fetch fail
              rate {Math.round(data.graphEnumeration.fetchFailureRate24h * 100)}% · block rate{' '}
              {Math.round(data.graphEnumeration.blockRate24h * 100)}%
              {data.graphEnumeration.throttleRecommended ? ' · throttle recommended' : ''}
            </p>
          </div>

          <div className="mb-6 rounded-md border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Source expansion (Phase 2)</h3>
            <p className="mt-1 text-xs text-slate-600">
              Nationwide crawl footprint — discovery cron promotes validated city pages and repairs empty{' '}
              <code className="text-xs">source_pages</code> before general revalidation.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Crawlable configs" value={data.sourceExpansion.crawlableConfigs} />
              <Metric
                label="No source pages"
                value={data.sourceExpansion.configsWithoutSourcePages}
                highlight
              />
              <Metric label="Pending discovery" value={data.sourceExpansion.pendingDiscoveryConfigs} />
              <Metric label="Validated discovery" value={data.sourceExpansion.validatedDiscoveryConfigs} />
            </div>
          </div>

          {trendData.length > 1 && (
            <div className="mb-6 h-56 w-full">
              <p className="mb-2 text-sm font-medium text-gray-700">Coverage trend (completed audits)</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <ReferenceLine
                    y={data.targetPct}
                    stroke="#b45309"
                    strokeDasharray="4 4"
                    label={{ value: `${data.targetPct}% target`, position: 'insideTopRight', fontSize: 10 }}
                  />
                  <Line type="monotone" dataKey="coverage" stroke="#047857" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Missing by state (top)</h3>
              {missingStateRows.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No missing valid URLs in audit footprint yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {missingStateRows.map(([state, count]) => (
                    <li key={state} className="flex justify-between gap-4 border-b border-gray-100 py-1">
                      <span>{state}</span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Missing by metro (top)</h3>
              {missingMetroRows.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No metro breakdown yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {missingMetroRows.map(([metro, count]) => (
                    <li key={metro} className="flex justify-between gap-4 border-b border-gray-100 py-1">
                      <span className="truncate">{metro}</span>
                      <span className="shrink-0 font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
