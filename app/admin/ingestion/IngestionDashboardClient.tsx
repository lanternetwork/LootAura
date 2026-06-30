'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type {
  IngestionMetricsDiagnosticsResponse,
  IngestionMetricsResponse,
} from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import type { IngestionDashboardMode } from '@/lib/admin/ingestionDashboardOverview'
import {
  INGESTION_CORE_METRICS_POLL_MS,
  INGESTION_DIAGNOSTICS_POLL_MS,
} from '@/lib/admin/ingestionDashboardPolling'
import { mergeIngestionMetricsWithDiagnostics } from '@/lib/admin/ingestionMetricsMerge'
import { buildEngineeringReport } from '@/lib/admin/diagnostics/v4/export/buildEngineeringReport'
import { buildIngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/buildIngestionDiagnosticsModel'
import { copyTextToClipboard } from '@/lib/admin/copyTextToClipboard'
import IngestionOverviewPanel from '@/app/admin/ingestion/IngestionOverviewPanel'
import IngestionDebugPanel from '@/app/admin/ingestion/IngestionDebugPanel'
import IngestionControlsPanel from '@/app/admin/ingestion/IngestionControlsPanel'

const COVERAGE_POLL_MS = 30_000
const MAX_SNAPSHOT_POINTS = 360

type SnapshotPoint = {
  t: number
  backlog: number
  efficiency: number | null
}

const MODE_TABS: { id: IngestionDashboardMode; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'debug', label: 'Debug' },
  { id: 'controls', label: 'Controls' },
]

export default function IngestionDashboardClient() {
  const [mode, setMode] = useState<IngestionDashboardMode>('overview')
  const [data, setData] = useState<IngestionMetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [diagnosticsLoaded, setDiagnosticsLoaded] = useState(false)
  const [snapshots, setSnapshots] = useState<SnapshotPoint[]>([])
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [copyRefreshing, setCopyRefreshing] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [baselineState, setBaselineState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [baselineError, setBaselineError] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<YstmCoverageMetricsResponse | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(true)
  const [coverageError, setCoverageError] = useState<string | null>(null)

  const coreInFlightRef = useRef(false)
  const diagnosticsInFlightRef = useRef(false)
  const coreDataRef = useRef<IngestionMetricsResponse | null>(null)
  const diagnosticsDataRef = useRef<IngestionMetricsDiagnosticsResponse | null>(null)

  const applyMergedMetrics = useCallback(
    (core: IngestionMetricsResponse, diagnostics?: IngestionMetricsDiagnosticsResponse | null) => {
      coreDataRef.current = core
      const merged = diagnostics ? mergeIngestionMetricsWithDiagnostics(core, diagnostics) : core
      setData(merged)
      const now = Date.now()
      setSnapshots((prev) =>
        [...prev, { t: now, backlog: merged.backlog, efficiency: merged.efficiency }].slice(
          -MAX_SNAPSHOT_POINTS
        )
      )
    },
    []
  )

  const loadCoreMetrics = useCallback(async (): Promise<IngestionMetricsResponse | null> => {
    if (coreInFlightRef.current) {
      return coreDataRef.current
    }
    coreInFlightRef.current = true
    try {
      const res = await fetch('/api/admin/ingestion/metrics', { credentials: 'include' })
      const json = (await res.json()) as IngestionMetricsResponse & {
        code?: string
        message?: string
      }

      if (!res.ok || !json.ok) {
        throw new Error((json as { message?: string }).message || `HTTP ${res.status}`)
      }

      setError(null)
      applyMergedMetrics(json, diagnosticsDataRef.current)
      return json
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      coreInFlightRef.current = false
      setLoading(false)
    }
  }, [applyMergedMetrics])

  const loadDiagnostics = useCallback(
    async (options?: { force?: boolean }): Promise<IngestionMetricsDiagnosticsResponse | null> => {
      if (diagnosticsInFlightRef.current && !options?.force) {
        return null
      }
      diagnosticsInFlightRef.current = true
      setDiagnosticsLoading(true)
      setDiagnosticsError(null)
      try {
        const res = await fetch('/api/admin/ingestion/metrics/diagnostics', {
          credentials: 'include',
        })
        const json = (await res.json()) as IngestionMetricsDiagnosticsResponse & {
          code?: string
          message?: string
        }
        if (!res.ok || !json.ok) {
          throw new Error((json as { message?: string }).message || `HTTP ${res.status}`)
        }
        const core = coreDataRef.current
        diagnosticsDataRef.current = json
        if (core) {
          applyMergedMetrics(core, json)
        }
        setDiagnosticsLoaded(true)
        return json
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setDiagnosticsError(message)
        return null
      } finally {
        diagnosticsInFlightRef.current = false
        setDiagnosticsLoading(false)
      }
    },
    [applyMergedMetrics]
  )

  const loadCoverage = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ingestion/ystm-coverage', { credentials: 'include' })
      const json = (await res.json()) as YstmCoverageMetricsResponse & {
        ok?: boolean
        message?: string
      }
      if (!res.ok || !json.ok) {
        throw new Error(json.message || `HTTP ${res.status}`)
      }
      setCoverage(json)
      setCoverageError(null)
    } catch (e) {
      setCoverageError(e instanceof Error ? e.message : String(e))
    } finally {
      setCoverageLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCoreMetrics()
    void loadDiagnostics()

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void loadCoreMetrics()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const coreId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadCoreMetrics()
    }, INGESTION_CORE_METRICS_POLL_MS)

    const diagnosticsId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadDiagnostics()
    }, INGESTION_DIAGNOSTICS_POLL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(coreId)
      window.clearInterval(diagnosticsId)
    }
  }, [loadCoreMetrics, loadDiagnostics])

  useEffect(() => {
    void loadCoverage()
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadCoverage()
    }, COVERAGE_POLL_MS)
    return () => window.clearInterval(id)
  }, [loadCoverage])

  useEffect(() => {
    if (mode === 'debug' && !diagnosticsLoaded && !diagnosticsLoading) {
      void loadDiagnostics({ force: true })
    }
  }, [mode, diagnosticsLoaded, diagnosticsLoading, loadDiagnostics])

  const resetMetricsBaseline = useCallback(async () => {
    setBaselineState('loading')
    setBaselineError(null)
    try {
      const res = await fetch('/api/admin/ingestion/metrics/baseline', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
        error?: string
      }
      if (!res.ok || !json.ok) {
        throw new Error(json.message || json.error || `HTTP ${res.status}`)
      }
      setBaselineState('done')
      await loadCoreMetrics()
      await loadDiagnostics({ force: true })
      window.setTimeout(() => setBaselineState('idle'), 3000)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setBaselineError(message)
      setBaselineState('error')
      window.setTimeout(() => setBaselineState('idle'), 5000)
      throw e
    }
  }, [loadCoreMetrics, loadDiagnostics])

  const copyDiagnostics = useCallback(async () => {
    if (!data) return
    setCopyError(null)
    setCopyRefreshing(true)
    let metricsForCopy = data
    let freshCoverage = coverage
    try {
      const [diag, coverageRes] = await Promise.all([
        loadDiagnostics({ force: true }),
        fetch('/api/admin/ingestion/ystm-coverage', { credentials: 'include' }),
      ])
      const core = coreDataRef.current
      if (core && diag) {
        metricsForCopy = mergeIngestionMetricsWithDiagnostics(core, diag)
        setData(metricsForCopy)
      }
      const json = (await coverageRes.json()) as YstmCoverageMetricsResponse & {
        ok?: boolean
        message?: string
      }
      if (coverageRes.ok && json.ok) {
        freshCoverage = json
        setCoverage(json)
        setCoverageError(null)
      }
    } catch {
      /* use last known coverage if refresh fails */
    } finally {
      setCopyRefreshing(false)
    }

    const environment =
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      process.env.NODE_ENV ??
      (typeof window !== 'undefined' ? window.location.hostname : 'unknown')
    const copiedAt = new Date().toISOString()
    const model = buildIngestionDiagnosticsModel({
      metrics: metricsForCopy,
      coverage: freshCoverage,
      environment,
      generatedAt: copiedAt,
    })
    const text = buildEngineeringReport(model)
    try {
      await copyTextToClipboard(text)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 2000)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setCopyError(message)
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 5000)
    }
  }, [data, coverage, loadDiagnostics])

  const refreshAll = useCallback(() => {
    setLoading(true)
    void loadCoreMetrics()
    void loadDiagnostics({ force: true })
  }, [loadCoreMetrics, loadDiagnostics])

  return (
    <div className="min-h-screen bg-gray-50 py-8 text-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Ingestion</h1>
            <p className="mt-1 text-sm text-gray-600">
              Core metrics every {INGESTION_CORE_METRICS_POLL_MS / 1000}s · Diagnostics every{' '}
              {INGESTION_DIAGNOSTICS_POLL_MS / 1000}s (paused when tab hidden) · Coverage every{' '}
              {COVERAGE_POLL_MS / 1000}s
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refreshAll()}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
            >
              Refresh now
            </button>
            <Link
              href="/admin/ingestion/v2"
              className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 shadow-sm hover:bg-indigo-100"
            >
              v2 dashboard
            </Link>
            <Link
              href="/admin/tools"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
            >
              ← Admin tools
            </Link>
          </div>
        </div>

        <nav
          className="mb-6 flex flex-wrap gap-2 border-b border-gray-200 pb-3"
          aria-label="Dashboard mode"
        >
          {MODE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                mode === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {diagnosticsError && (
          <p className="mb-4 text-sm text-amber-800" role="status">
            Diagnostics refresh failed: {diagnosticsError}
          </p>
        )}

        {copyError && mode !== 'overview' && (
          <p className="mb-4 text-sm text-red-700" role="alert">
            Copy diagnostics: {copyError}
          </p>
        )}

        {loading && !data && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-600">
            Loading…
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-medium">Failed to load metrics</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                refreshAll()
              }}
              className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {data && mode === 'overview' && (
          <IngestionOverviewPanel
            metrics={data}
            coverage={coverage}
            coverageError={coverageError}
            diagnosticsLoading={diagnosticsLoading && !diagnosticsLoaded}
            onCopyDiagnostics={() => void copyDiagnostics()}
            copyState={copyState}
            copyDisabled={loading || copyRefreshing}
            copyRefreshing={copyRefreshing}
            onOpenDebug={() => setMode('debug')}
            onOpenControls={() => setMode('controls')}
          />
        )}

        {data && mode === 'debug' && (
          <IngestionDebugPanel
            data={data}
            snapshots={snapshots}
            coverage={coverage}
            coverageLoading={coverageLoading}
            coverageError={coverageError}
            onCoverageRefresh={loadCoverage}
            diagnosticsLoading={diagnosticsLoading && !diagnosticsLoaded}
            onRefreshDiagnostics={() => void loadDiagnostics({ force: true })}
          />
        )}

        {data && mode === 'controls' && (
          <IngestionControlsPanel
            metrics={data}
            coverage={coverage}
            coverageLoading={coverageLoading}
            coverageError={coverageError}
            onCoverageRefresh={loadCoverage}
            metricsLoading={loading}
            onResetMetricsBaseline={resetMetricsBaseline}
            baselineState={baselineState}
            baselineError={baselineError}
            onOpenDebug={() => setMode('debug')}
          />
        )}
      </div>
    </div>
  )
}
