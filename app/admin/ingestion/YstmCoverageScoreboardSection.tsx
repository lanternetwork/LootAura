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
import { evaluateWeekOneSprintGates } from '@/lib/admin/weekOneSprintGates'
import { evaluateYstmSaleInstanceRolloutGates } from '@/lib/admin/evaluateYstmSaleInstanceRolloutGates'

const POLL_MS = 30_000

/** Per click — keeps server work under maxDuration; user can run again until gate passes. */
const BACKFILL_BATCH_SIZE = 50
const BACKFILL_MAX_ROWS = 250

type BackfillSummary = {
  processed: number
  rowsBackfilled: number
  aliasesRecorded: number
  skipped: number
  keyCollisions: number
  ambiguousRows: number
  dryRun: boolean
  lastProcessedId: string | null
}

type BackfillUiState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; summary: BackfillSummary; at: string }
  | { kind: 'error'; message: string; at: string }

type BootstrapUiState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'error'; message: string }

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
  const [backfillUi, setBackfillUi] = useState<BackfillUiState>({ kind: 'idle' })
  const [bootstrapUi, setBootstrapUi] = useState<BootstrapUiState>({ kind: 'idle' })
  const [esnetBootstrapUi, setEsnetBootstrapUi] = useState<BootstrapUiState>({ kind: 'idle' })
  const [esnetIngestUi, setEsnetIngestUi] = useState<BootstrapUiState>({ kind: 'idle' })

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ingestion/ystm-coverage', { credentials: 'include' })
      const json = (await res.json()) as YstmCoverageMetricsResponse & { code?: string; message?: string }
      if (!res.ok || !json.ok) {
        const detail =
          json.message ||
          (typeof json.code === 'string' ? json.code : null) ||
          res.statusText ||
          `HTTP ${res.status}`
        throw new Error(detail)
      }
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const runIdentityBackfill = useCallback(async () => {
    setBackfillUi({ kind: 'running' })
    try {
      const res = await fetch('/api/admin/ingested-sales/backfill-sale-instance-identity', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchSize: BACKFILL_BATCH_SIZE,
          dryRun: false,
          maxRows: BACKFILL_MAX_ROWS,
        }),
      })
      const json = (await res.json()) as {
        ok?: boolean
        summary?: BackfillSummary
        message?: string
        code?: string
      }
      if (!res.ok || !json.ok || !json.summary) {
        const detail =
          json.message ||
          (typeof json.code === 'string' ? json.code : null) ||
          res.statusText ||
          `HTTP ${res.status}`
        throw new Error(detail)
      }
      setBackfillUi({ kind: 'done', summary: json.summary, at: new Date().toISOString() })
      await load()
    } catch (e) {
      setBackfillUi({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
        at: new Date().toISOString(),
      })
    }
  }, [load])

  const toggleProviderRuntime = useCallback(
    async (
      enabled: boolean,
      target: 'nationwide' | 'ingest' | 'bootstrap' = 'nationwide'
    ) => {
      const setUi =
        target === 'ingest'
          ? setEsnetIngestUi
          : target === 'bootstrap'
            ? setEsnetBootstrapUi
            : setBootstrapUi
      if (
        enabled &&
        !window.confirm(
          target === 'ingest'
            ? 'Enable EstateSales.NET provider ingestion? Persists list/detail observations when configs exist. Stored in DB — no deploy or Vercel env change.'
            : target === 'bootstrap'
              ? 'Enable EstateSales.NET burst bootstrap? Raises ingest budgets temporarily. Auto-disables when exit criteria are met; provider ingestion stays on.'
              : 'Enable nationwide coverage bootstrap? This increases audit/ingest/repair throughput and may dip coverage % while the audit footprint grows. Auto-disables when exit criteria are met.'
        )
      ) {
        return
      }
      setUi({ kind: 'running' })
      try {
        const res = await fetch('/api/admin/ingestion/coverage-bootstrap', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, target }),
        })
        const json = (await res.json()) as { ok?: boolean; message?: string; code?: string }
        if (!res.ok || !json.ok) {
          throw new Error(json.message || json.code || `HTTP ${res.status}`)
        }
        setUi({ kind: 'idle' })
        await load()
      } catch (e) {
        setUi({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [load]
  )

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
  const sprintGates = data ? evaluateWeekOneSprintGates(data) : null
  const rolloutGates = data ? evaluateYstmSaleInstanceRolloutGates(data) : null
  const activeKeyPct =
    data && data.publishedActiveLootAuraYstmUrls > 0
      ? (data.saleInstanceIdentity.ystmActiveRowsWithKey / data.publishedActiveLootAuraYstmUrls) * 100
      : null

  return (
    <section className="mb-8 rounded-lg border border-emerald-300 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-emerald-950">External marketplace nationwide coverage</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Product goal: published active LootAura external-source sales visible on the map ÷ valid active external
            listings from bounded audits. Not crawl discovered/skipped counts.
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
          <div
            className={`mb-4 rounded-md border p-4 ${
              data.coverageBootstrap.enabled
                ? 'border-amber-400 bg-amber-50'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Nationwide coverage bootstrap</h3>
                <p className="mt-1 text-xs text-slate-700">
                  Temporary catch-up mode: metro-priority audit, post-audit missing-ingest/repair, higher code
                  budgets. Stored in DB — no Vercel env changes. Auto-disables when exit criteria are met (≥24h
                  enabled).
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Status:{' '}
                  <span className="font-semibold">{data.coverageBootstrap.enabled ? 'ON' : 'OFF'}</span>
                  {data.coverageBootstrap.enabledAt && (
                    <> · enabled {formatWhen(data.coverageBootstrap.enabledAt)}</>
                  )}
                  {!data.coverageBootstrap.enabled && data.coverageBootstrap.disabledAt && (
                    <>
                      {' '}
                      · disabled {formatWhen(data.coverageBootstrap.disabledAt)}
                      {data.coverageBootstrap.disabledReason
                        ? ` (${data.coverageBootstrap.disabledReason})`
                        : ''}
                    </>
                  )}
                </p>
                {data.coverageBootstrap.enabled && (
                  <p className="mt-1 text-xs text-slate-600">
                    Exit preview:{' '}
                    {data.coverageBootstrap.exitCriteriaPreview.met
                      ? 'criteria met — will auto-disable on next scoreboard/audit check'
                      : data.coverageBootstrap.exitCriteriaPreview.reasons.slice(0, 3).join('; ') ||
                        'pending'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {data.coverageBootstrap.enabled ? (
                  <button
                    type="button"
                    disabled={bootstrapUi.kind === 'running'}
                    onClick={() => void toggleProviderRuntime(false, 'nationwide')}
                    className="rounded border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Disable bootstrap
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={bootstrapUi.kind === 'running'}
                    onClick={() => void toggleProviderRuntime(true, 'nationwide')}
                    className="rounded border border-amber-600 bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Enable nationwide bootstrap
                  </button>
                )}
              </div>
            </div>
            {bootstrapUi.kind === 'error' && (
              <p className="mt-2 text-xs text-red-700">{bootstrapUi.message}</p>
            )}
          </div>

          <div
            className={`mb-4 rounded-md border p-4 ${
              data.esnetIngest.enabled ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">EstateSales.NET provider ingestion</h3>
                <p className="mt-1 text-xs text-slate-700">
                  DB key <code className="text-xs">esnet_ingest_enabled</code>. Controls list persist and detail
                  enrichment for <code className="text-xs">estatesales_net</code> configs. Never auto-disables —
                  turn off manually from the dashboard.
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Status: <span className="font-semibold">{data.esnetIngest.enabled ? 'ON' : 'OFF'}</span>
                  {' · '}
                  crawlable configs: {data.esnetIngest.crawlableConfigCount.toLocaleString()}
                  {' · '}
                  ingest cadence: ~{data.esnetIngest.ingestMinIntervalMinutes} min between passes
                  {data.esnetIngest.enabledAt && <> · enabled {formatWhen(data.esnetIngest.enabledAt)}</>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.esnetIngest.enabled ? (
                  <button
                    type="button"
                    disabled={esnetIngestUi.kind === 'running'}
                    onClick={() => void toggleProviderRuntime(false, 'ingest')}
                    className="rounded border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Disable ES.net ingestion
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={esnetIngestUi.kind === 'running'}
                    onClick={() => void toggleProviderRuntime(true, 'ingest')}
                    className="rounded border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Enable ES.net ingestion
                  </button>
                )}
              </div>
            </div>
            {esnetIngestUi.kind === 'error' && (
              <p className="mt-2 text-xs text-red-700">{esnetIngestUi.message}</p>
            )}
          </div>

          <div
            className={`mb-4 rounded-md border p-4 ${
              data.esnetBootstrap.enabled ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">EstateSales.NET burst bootstrap</h3>
                <p className="mt-1 text-xs text-slate-700">
                  DB key <code className="text-xs">esnet_bootstrap_enabled</code>. Temporary higher ingest budgets
                  only — does not disable discovery or provider ingestion when it auto-exits.
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Status: <span className="font-semibold">{data.esnetBootstrap.enabled ? 'ON' : 'OFF'}</span>
                  {data.esnetBootstrap.enabledAt && (
                    <> · enabled {formatWhen(data.esnetBootstrap.enabledAt)}</>
                  )}
                </p>
                {data.esnetBootstrap.enabled && (
                  <p className="mt-1 text-xs text-slate-600">
                    Exit preview:{' '}
                    {data.esnetBootstrap.exitCriteriaPreview.met
                      ? 'criteria met — bootstrap will auto-disable on next check'
                      : data.esnetBootstrap.exitCriteriaPreview.reasons.slice(0, 3).join('; ') || 'pending'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {data.esnetBootstrap.enabled ? (
                  <button
                    type="button"
                    disabled={esnetBootstrapUi.kind === 'running'}
                    onClick={() => void toggleProviderRuntime(false, 'bootstrap')}
                    className="rounded border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Disable ES.net bootstrap
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={esnetBootstrapUi.kind === 'running'}
                    onClick={() => void toggleProviderRuntime(true, 'bootstrap')}
                    className="rounded border border-sky-600 bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    Enable ES.net bootstrap
                  </button>
                )}
              </div>
            </div>
            {esnetBootstrapUi.kind === 'error' && (
              <p className="mt-2 text-xs text-red-700">{esnetBootstrapUi.message}</p>
            )}
          </div>

          {sprintGates && (
            <div className="mb-4 rounded-md border border-violet-200 bg-violet-50 p-4">
              <h3 className="text-sm font-semibold text-violet-950">Week-1 sprint gates</h3>
              <p className="mt-1 text-xs text-violet-900">
                Footprint + discovery + repair targets for the one-week sprint (repo burn-in budgets; no new
                Vercel env). G4 hold is not evaluated here.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {sprintGates.gates.map((gate) => (
                  <li
                    key={gate.id}
                    className={`flex flex-wrap items-start justify-between gap-2 rounded border px-3 py-2 ${
                      gate.status === 'pass'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                        : gate.status === 'pending'
                          ? 'border-amber-300 bg-amber-50 text-amber-950'
                          : 'border-red-300 bg-red-50 text-red-950'
                    }`}
                  >
                    <span className="font-medium">
                      {gate.status === 'pass' ? 'PASS' : gate.status === 'pending' ? 'PENDING' : 'FAIL'}:{' '}
                      {gate.label}
                    </span>
                    <span className="text-xs tabular-nums">{gate.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-violet-800">
                Runbook: <code className="text-xs">docs/EXTERNAL_SOURCE_ONE_WEEK_SPRINT.md</code>
              </p>
            </div>
          )}

          {rolloutGates && (
            <div className="mb-4 rounded-md border border-slate-300 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-950">
                Sale-instance rollout gates (Phase 14)
              </h3>
              <p className="mt-1 text-xs text-slate-800">
                Program readiness before classifier enforcement (Stage D). Observability (Stage A) must
                pass first; enforcement gates block URL-only skip removal until green.
              </p>
              <p className="mt-2 text-xs font-medium text-slate-900">
                Observability ready: {rolloutGates.observabilityReady ? 'yes' : 'no'} · Enforcement
                ready: {rolloutGates.enforcementReady ? 'yes' : 'no'}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {rolloutGates.gates.map((gate) => (
                  <li
                    key={gate.id}
                    className={`flex flex-wrap items-start justify-between gap-2 rounded border px-3 py-2 ${
                      gate.status === 'pass'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                        : gate.status === 'pending'
                          ? 'border-amber-300 bg-amber-50 text-amber-950'
                          : 'border-red-300 bg-red-50 text-red-950'
                    }`}
                  >
                    <span className="font-medium">
                      [{gate.stage}] {gate.status === 'pass' ? 'PASS' : gate.status === 'pending' ? 'PENDING' : 'FAIL'}:{' '}
                      {gate.label}
                    </span>
                    <span className="text-xs tabular-nums">{gate.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-700">
                Runbook: <code className="text-xs">docs/EXTERNAL_SOURCE_FALSE_EXCLUSION_AUDIT.md</code> (Phase 14)
              </p>
            </div>
          )}

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
              <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Valid active external listings (audit)</p>
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
              <p className="text-xs font-medium uppercase tracking-wide text-amber-900">Missing valid external listings</p>
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

          <div className="mb-6 rounded-md border border-sky-200 bg-sky-50 p-4">
            <h3 className="text-sm font-semibold text-sky-950">Sale-instance identity (Phase 3)</h3>
            <p className="mt-1 text-xs text-sky-900">
              New external-source inserts populate sale_instance_key and hashes (observability only — dedupe still
              uses source_url until later phases).
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Rows with key" value={data.saleInstanceIdentity.ystmRowsWithKey} />
              <Metric
                label="Active rows with key"
                value={data.saleInstanceIdentity.ystmActiveRowsWithKey}
              />
              <Metric
                label="Key collision groups"
                value={data.saleInstanceIdentity.keyCollisionGroups}
                highlight={data.saleInstanceIdentity.keyCollisionGroups > 0}
              />
            </div>
            {data.saleInstanceIdentity.sampleCollisionKeys.length > 0 && (
              <p className="mt-2 text-xs font-mono text-sky-900">
                Sample collisions: {data.saleInstanceIdentity.sampleCollisionKeys.join(' · ')}
              </p>
            )}
            <div className="mt-4 rounded-md border border-sky-300 bg-white p-3">
              <p className="text-xs text-sky-950">
                Phase 12 backfill fills <code className="text-[11px]">sale_instance_key</code> on existing
                external-source rows. Rollout gate target: ≥95% of published-active rows (
                {activeKeyPct != null ? `${activeKeyPct.toFixed(1)}% now` : '—'}). Each run processes up to{' '}
                {BACKFILL_MAX_ROWS.toLocaleString()} rows — click again until the percentage stops rising.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void runIdentityBackfill()}
                  disabled={backfillUi.kind === 'running'}
                  className="rounded-md border border-sky-600 bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {backfillUi.kind === 'running' ? 'Running backfill…' : 'Run identity backfill'}
                </button>
                {backfillUi.kind === 'running' && (
                  <p className="text-xs text-sky-800">This may take 1–2 minutes. Do not close the tab.</p>
                )}
              </div>
              {backfillUi.kind === 'done' && (
                <div className="mt-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                  <p className="font-medium">Backfill batch completed ({formatWhen(backfillUi.at)})</p>
                  <p className="mt-1">
                    Processed {backfillUi.summary.processed.toLocaleString()} · backfilled{' '}
                    {backfillUi.summary.rowsBackfilled.toLocaleString()} · skipped{' '}
                    {backfillUi.summary.skipped.toLocaleString()} · collisions{' '}
                    {backfillUi.summary.keyCollisions.toLocaleString()} · ambiguous{' '}
                    {backfillUi.summary.ambiguousRows.toLocaleString()}
                  </p>
                  {backfillUi.summary.rowsBackfilled === 0 && (
                    <p className="mt-1">No rows left without a key in this pass — you may be done.</p>
                  )}
                </div>
              )}
              {backfillUi.kind === 'error' && (
                <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
                  <p className="font-medium">Backfill failed ({formatWhen(backfillUi.at)})</p>
                  <p className="mt-1">{backfillUi.message}</p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-6 rounded-md border border-teal-200 bg-teal-50 p-4">
            <h3 className="text-sm font-semibold text-teal-950">Source URL alias history (Phase 4)</h3>
            <p className="mt-1 text-xs text-teal-900">
              Append-only URL rows per ingested sale for reuse tracking. Does not relax source_url
              uniqueness yet.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Alias rows" value={data.sourceUrlAlias.totalAliasRows} />
            </div>
          </div>

          <div className="mb-6 rounded-md border border-sky-200 bg-sky-50 p-4">
            <h3 className="text-sm font-semibold text-sky-950">Sale-instance shadow replay (Phase 9)</h3>
            <p className="mt-1 text-xs text-sky-900">
              Every missing valid external listing URL is replayed through the legacy URL gate and the new
              classifier. Outcomes are persisted for lead review before enforcement changes.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Replayed" value={data.saleInstanceShadowReplay.replayedCount} />
              <Metric
                label="Legacy would suppress"
                value={data.saleInstanceShadowReplay.oldSuppressCount}
              />
              <Metric
                label="New would publish"
                value={data.saleInstanceShadowReplay.wouldPublishCount}
                highlight={data.saleInstanceShadowReplay.wouldPublishCount > 0}
              />
              <Metric
                label="Old suppress → new publish"
                value={data.saleInstanceShadowReplay.divergenceOldSuppressNewPublishCount}
                highlight={
                  data.saleInstanceShadowReplay.divergenceOldSuppressNewPublishCount > 0
                }
              />
            </div>
            {data.saleInstanceShadowReplay.sampleDivergences.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-sky-950">
                {data.saleInstanceShadowReplay.sampleDivergences.map((d) => (
                  <li key={d.canonicalUrl} className="font-mono">
                    {d.canonicalUrl} — {d.oldDecision} → {d.newDecision}
                    {d.wouldPublish ? ' (would publish)' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-950">
              External source false exclusion / sale identity (Phase 13)
            </h3>
            <p className="mt-1 text-xs text-amber-900">
              Unified operational view: missing coverage, URL reuse, classifier shadow outcomes,
              soft-dedupe suppressions, instance-key collisions, and duplicate-visible guardrails.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Missing valid external listings URLs"
                value={data.falseExclusionSaleIdentity.missingValidYstmUrls}
                highlight={data.falseExclusionSaleIdentity.missingValidYstmUrls > 0}
              />
              <Metric
                label="Never attempted"
                value={data.falseExclusionSaleIdentity.missingNeverAttempted}
              />
              <Metric
                label="URL match same dates"
                value={data.falseExclusionSaleIdentity.urlMatchSameDates}
              />
              <Metric
                label="URL match dates changed"
                value={data.falseExclusionSaleIdentity.urlMatchDatesChanged}
              />
              <Metric
                label="URL reuse detected"
                value={data.falseExclusionSaleIdentity.urlReuseDetected}
              />
              <Metric
                label="New event same URL"
                value={data.falseExclusionSaleIdentity.newEventSameUrl}
              />
              <Metric
                label="Same event updated"
                value={data.falseExclusionSaleIdentity.sameEventUpdated}
              />
              <Metric
                label="Soft dedupe suppressed (24h)"
                value={data.falseExclusionSaleIdentity.softDedupeSuppressed}
              />
              <Metric
                label="Suspicious suppressions (24h)"
                value={data.falseExclusionSaleIdentity.suspiciousSuppressions}
                highlight={data.falseExclusionSaleIdentity.suspiciousSuppressions > 0}
              />
              <Metric
                label="Ambiguous (review)"
                value={data.falseExclusionSaleIdentity.ambiguousRequiresReview}
                highlight={data.falseExclusionSaleIdentity.ambiguousRequiresReview > 0}
              />
              <Metric
                label="Instance key collisions"
                value={data.falseExclusionSaleIdentity.saleInstanceKeyCollisions}
                highlight={data.falseExclusionSaleIdentity.saleInstanceKeyCollisions > 0}
              />
              <Metric
                label="Coverage rows w/o match_method"
                value={data.falseExclusionSaleIdentity.coverageWithoutMatchMethod}
                highlight={data.falseExclusionSaleIdentity.coverageWithoutMatchMethod > 0}
              />
              <Metric
                label="Duplicate visible clusters"
                value={data.falseExclusionSaleIdentity.duplicateVisibleSaleClusters24h}
                highlight={
                  data.falseExclusionSaleIdentity.duplicateVisibleSaleClusters24h >= 3
                }
              />
              <Metric
                label="Extra visible dup rows"
                value={data.falseExclusionSaleIdentity.duplicateVisibleSameAddressDate24h}
              />
            </div>
            {Object.keys(data.falseExclusionSaleIdentity.coverageMatchMethodCounts).length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs text-amber-950">
                  <thead>
                    <tr className="border-b border-amber-200">
                      <th className="py-1 pr-4 font-medium">Coverage match_method</th>
                      <th className="py-1 font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.falseExclusionSaleIdentity.coverageMatchMethodCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([method, count]) => (
                        <tr key={method} className="border-b border-amber-100">
                          <td className="py-1 pr-4 font-mono">{method}</td>
                          <td className="py-1 tabular-nums">{count.toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.falseExclusionSaleIdentity.alerts.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-amber-950">
                {data.falseExclusionSaleIdentity.alerts.map((a) => (
                  <li key={a.code}>
                    <span
                      className={
                        a.level === 'critical'
                          ? 'font-semibold text-red-800'
                          : 'font-semibold text-amber-900'
                      }
                    >
                      [{a.level}]
                    </span>{' '}
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-amber-800">
              Healthy: {data.falseExclusionSaleIdentity.healthy ? 'yes' : 'no'} · generated{' '}
              {new Date(data.falseExclusionSaleIdentity.generatedAt).toLocaleString()}
            </p>
          </div>

          <div className="mb-6 rounded-md border border-violet-200 bg-violet-50 p-4">
            <h3 className="text-sm font-semibold text-violet-950">
              False-exclusion audit (Phase 1)
            </h3>
            <p className="mt-1 text-xs text-violet-900">
              Every missing valid external listing URL is traced to a primary bucket (replay queue). Refreshed on
              each scoreboard load; persisted on coverage observations.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Traced missing"
                value={data.falseExclusionAudit.tracedCount}
                highlight
              />
              <Metric
                label="Never attempted (ingest)"
                value={data.pipelineBacklog.missingIngestionNeverAttempted}
              />
            </div>
            {Object.entries(data.falseExclusionAudit.byPrimaryBucket)
              .filter(([, n]) => n > 0)
              .sort((a, b) => b[1] - a[1])
              .length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs text-violet-950">
                  <thead>
                    <tr className="border-b border-violet-200">
                      <th className="py-1 pr-4 font-medium">Primary bucket</th>
                      <th className="py-1 font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.falseExclusionAudit.byPrimaryBucket)
                      .filter(([, n]) => n > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([bucket, count]) => (
                        <tr key={bucket} className="border-b border-violet-100">
                          <td className="py-1 pr-4 font-mono">{bucket}</td>
                          <td className="py-1 tabular-nums">{count.toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.falseExclusionAudit.traces.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-violet-950">
                  Sample traces ({data.falseExclusionAudit.traces.length} shown)
                </summary>
                <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-violet-900">
                  {data.falseExclusionAudit.traces.map((t) => (
                    <li key={t.canonicalUrl} className="rounded border border-violet-100 bg-white p-2">
                      <p className="font-mono break-all">{t.canonicalUrl}</p>
                      <p>
                        <span className="font-semibold">{t.primaryBucket}</span>
                        {t.secondaryTags.length > 0 ? ` · ${t.secondaryTags.join(', ')}` : ''}
                      </p>
                      <p className="text-violet-800">{t.summary}</p>
                      {t.evidence.saleInstanceKey && (
                        <p className="mt-1 font-mono text-[10px] text-violet-700">
                          sale_instance_key: {t.evidence.saleInstanceKey}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="mb-6 rounded-md border border-indigo-200 bg-indigo-50 p-4">
            <h3 className="text-sm font-semibold text-indigo-950">Pipeline backlog (Phase 7 SLO)</h3>
            <p className="mt-1 text-xs text-indigo-900">
              Work queues that must drain for coverage to reach {data.targetPct}% — distinct from crawl
              discovered/skipped counts.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric
                label="Missing valid external listings"
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
              Re-processes stuck external-source ingested_sales (needs_check, publish_failed, coord gaps) via
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
              Re-fetches external listing detail pages for known ingested_sales to sync dates, content, and publish state.
              Stale threshold defaults to 12h since last source sync.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="External-source ingested corpus" value={data.existingRefresh.ystmDetailIngestedTotal} />
              <Metric label="Stale (&gt;12h)" value={data.existingRefresh.staleOver12h} highlight />
              <Metric label="Synced last 24h" value={data.existingRefresh.syncedLast24h} />
              <Metric label="Never synced" value={data.existingRefresh.neverSynced} />
            </div>
          </div>

          <div className="mb-6 rounded-md border border-violet-200 bg-violet-50 p-4">
            <h3 className="text-sm font-semibold text-violet-950">Missing URL ingestion (Phase 3)</h3>
            <p className="mt-1 text-xs text-violet-900">
              Daily cron ingests valid external listing URLs from the coverage audit footprint via detail-first + publish.
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
            <h3 className="text-sm font-semibold text-teal-950">External source graph enumeration</h3>
            <p className="mt-1 text-xs text-teal-900">
              Nationwide city/list registry build (evolved discovery cron). Feeds crawlable configs for
              ingestion and coverage — not a separate publish path.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Catalog states" value={data.graphEnumeration.catalogStates} />
              <Metric label="States w/ candidates" value={data.graphEnumeration.statesWithCandidates} />
              <Metric label="States remaining" value={data.graphEnumeration.statesRemaining} />
              <Metric label="Candidates total" value={data.graphEnumeration.candidatesDiscovered} highlight />
              <Metric label="Pending validation" value={data.graphEnumeration.pendingValidation} />
              <Metric label="Validated pages" value={data.graphEnumeration.validatedPages} />
              <Metric label="Registry promoted" value={data.graphEnumeration.promotedCandidates} />
              <Metric
                label="Configs promoted (last run)"
                value={data.graphEnumeration.configsPromotedLastRun}
              />
              <Metric label="Crawlable configs" value={data.graphEnumeration.sourceExpansion.crawlableConfigs} />
              <Metric
                label="No source pages"
                value={data.graphEnumeration.sourceExpansion.configsWithoutSourcePages}
                highlight
              />
            </div>
            {Object.keys(data.graphEnumeration.invalidPagesByStatus).length > 0 && (
              <p className="mt-2 text-xs text-teal-800">
                Invalid by status:{' '}
                {Object.entries(data.graphEnumeration.invalidPagesByStatus)
                  .map(([status, count]) => `${status} ${count}`)
                  .join(' · ')}
              </p>
            )}
            <p className="mt-2 text-xs text-teal-800">
              Validations (24h): {data.graphEnumeration.validationsLast24h.toLocaleString()} · fetch fail
              rate {Math.round(data.graphEnumeration.fetchFailureRate24h * 100)}% · block rate{' '}
              {Math.round(data.graphEnumeration.blockRate24h * 100)}%
              {data.graphEnumeration.throttleRecommended ? ' · throttle recommended' : ''}
            </p>
            {data.graphEnumeration.lastDiscoveryRun ? (
              <p className="mt-2 text-xs text-teal-800">
                Last discovery:{' '}
                {data.graphEnumeration.lastDiscoveryRun.skipped
                  ? 'skipped'
                  : data.graphEnumeration.lastDiscoveryRun.ok
                    ? 'ok'
                    : 'failed'}
                {data.graphEnumeration.lastDiscoveryRun.degraded ? ' (degraded)' : ''} ·{' '}
                {data.graphEnumeration.lastDiscoveryRun.statesScanned} states
                {data.graphEnumeration.lastDiscoveryRun.stateBatchPlanned != null
                  ? ` (batch ${data.graphEnumeration.lastDiscoveryRun.stateBatchPlanned})`
                  : ''}
                {data.graphEnumeration.lastDiscoveryRun.catalogSize != null
                  ? ` / catalog ${data.graphEnumeration.lastDiscoveryRun.catalogSize}`
                  : ''}{' '}
                · {data.graphEnumeration.lastDiscoveryRun.discoveryLatencyMs.toLocaleString()}ms · phases{' '}
                {data.graphEnumeration.lastDiscoveryRun.phasesCompleted.join(', ') || 'none'}
                {data.graphEnumeration.lastDiscoveryRun.skipReason
                  ? ` · skip ${data.graphEnumeration.lastDiscoveryRun.skipReason}`
                  : ''}
                {data.graphEnumeration.lastDiscoveryRun.graphEnumerationSkippedReason
                  ? ` · graph skip ${data.graphEnumeration.lastDiscoveryRun.graphEnumerationSkippedReason}`
                  : ''}
                {data.graphEnumeration.lastDiscoveryRun.graphEnumerationThrottled ? ' · throttled' : ''}
              </p>
            ) : (
              <p className="mt-2 text-xs text-teal-800">Last discovery: no orchestration run recorded yet.</p>
            )}
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
