'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import type { IngestionDashboardMode } from '@/lib/admin/ingestionDashboardOverview'
import { buildIngestionDiagnostics } from '@/lib/admin/buildIngestionDiagnostics'
import { copyTextToClipboard } from '@/lib/admin/copyTextToClipboard'
import IngestionOverviewPanel from '@/app/admin/ingestion/IngestionOverviewPanel'
import IngestionDebugPanel from '@/app/admin/ingestion/IngestionDebugPanel'
import IngestionControlsPanel from '@/app/admin/ingestion/IngestionControlsPanel'

const METRICS_POLL_MS = 5000
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
  const [snapshots, setSnapshots] = useState<SnapshotPoint[]>([])
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [copyRefreshing, setCopyRefreshing] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [baselineState, setBaselineState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [baselineError, setBaselineError] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<YstmCoverageMetricsResponse | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(true)
  const [coverageError, setCoverageError] = useState<string | null>(null)

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ingestion/metrics', { credentials: 'include' })
      const json = (await res.json()) as IngestionMetricsResponse & { code?: string; message?: string }

      if (!res.ok || !json.ok) {
        throw new Error((json as { message?: string }).message || `HTTP ${res.status}`)
      }

      setData(json)
      setError(null)

      const now = Date.now()
      setSnapshots((prev) =>
        [...prev, { t: now, backlog: json.backlog, efficiency: json.efficiency }].slice(-MAX_SNAPSHOT_POINTS)
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

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
    void loadMetrics()
    const id = window.setInterval(() => void loadMetrics(), METRICS_POLL_MS)
    return () => window.clearInterval(id)
  }, [loadMetrics])

  useEffect(() => {
    void loadCoverage()
    const id = window.setInterval(() => void loadCoverage(), COVERAGE_POLL_MS)
    return () => window.clearInterval(id)
  }, [loadCoverage])

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
      await loadMetrics()
      window.setTimeout(() => setBaselineState('idle'), 3000)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setBaselineError(message)
      setBaselineState('error')
      window.setTimeout(() => setBaselineState('idle'), 5000)
      throw e
    }
  }, [loadMetrics])

  const copyDiagnostics = useCallback(async () => {
    if (!data) return
    setCopyError(null)
    setCopyRefreshing(true)
    let freshCoverage = coverage
    try {
      const res = await fetch('/api/admin/ingestion/ystm-coverage', { credentials: 'include' })
      const json = (await res.json()) as YstmCoverageMetricsResponse & {
        ok?: boolean
        message?: string
      }
      if (res.ok && json.ok) {
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
    const text = buildIngestionDiagnostics(data, {
      environment,
      copiedAt: new Date().toISOString(),
      ystmCoverage: freshCoverage,
    })
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
  }, [data, coverage])

  return (
    <div className="min-h-screen bg-gray-50 py-8 text-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Ingestion</h1>
            <p className="mt-1 text-sm text-gray-600">
              Metrics every {METRICS_POLL_MS / 1000}s · Coverage every {COVERAGE_POLL_MS / 1000}s
            </p>
          </div>
          <Link
            href="/admin/tools"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
          >
            ← Admin tools
          </Link>
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
                void loadMetrics()
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
            onCopyDiagnostics={() => void copyDiagnostics()}
            copyState={copyState}
            copyDisabled={loading || copyRefreshing}
            copyRefreshing={copyRefreshing}
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
          />
        )}

        {data && mode === 'controls' && (
          <IngestionControlsPanel
            coverage={coverage}
            coverageLoading={coverageLoading}
            coverageError={coverageError}
            onCoverageRefresh={loadCoverage}
            metricsLoading={loading}
            onResetMetricsBaseline={resetMetricsBaseline}
            baselineState={baselineState}
            baselineError={baselineError}
          />
        )}
      </div>
    </div>
  )
}
