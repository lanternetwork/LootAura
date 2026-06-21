'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  ADMIN_INGESTION_JOB_DEFINITIONS,
  type AdminIngestionJobKey,
  type AdminIngestionJobRunResponse,
  type AdminIngestionJobRunStatus,
} from '@/lib/admin/ingestion/adminIngestionJobTypes'

const SESSION_STORAGE_KEY = 'lootaura.admin.ingestion.operations.v1'

type RowUiState = {
  status: AdminIngestionJobRunStatus | 'idle' | 'running'
  lastDurationMs: number | null
}

type StoredSessionState = {
  rows: Partial<Record<AdminIngestionJobKey, Pick<RowUiState, 'lastDurationMs'>>>
  lastResult: AdminIngestionJobRunResponse | null
}

function loadSessionState(): StoredSessionState {
  if (typeof window === 'undefined') {
    return { rows: {}, lastResult: null }
  }
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return { rows: {}, lastResult: null }
    const parsed = JSON.parse(raw) as StoredSessionState
    return {
      rows: parsed.rows ?? {},
      lastResult: parsed.lastResult ?? null,
    }
  } catch {
    return { rows: {}, lastResult: null }
  }
}

function saveSessionState(state: StoredSessionState) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors
  }
}

function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function badgeClass(status: RowUiState['status']): string {
  switch (status) {
    case 'success':
      return 'bg-emerald-100 text-emerald-800'
    case 'skipped':
      return 'bg-amber-100 text-amber-900'
    case 'failed':
      return 'bg-red-100 text-red-800'
    case 'running':
      return 'bg-sky-100 text-sky-800'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function badgeLabel(status: RowUiState['status']): string {
  switch (status) {
    case 'success':
      return 'Success'
    case 'skipped':
      return 'Skipped'
    case 'failed':
      return 'Failed'
    case 'running':
      return 'Running'
    default:
      return 'Idle'
  }
}

export default function IngestionOperationsSection() {
  const initial = useMemo(() => loadSessionState(), [])
  const [rows, setRows] = useState<Record<AdminIngestionJobKey, RowUiState>>(() => {
    const base = Object.fromEntries(
      ADMIN_INGESTION_JOB_DEFINITIONS.map((def) => [
        def.key,
        { status: 'idle' as const, lastDurationMs: initial.rows[def.key]?.lastDurationMs ?? null },
      ])
    ) as Record<AdminIngestionJobKey, RowUiState>
    return base
  })
  const [lastResult, setLastResult] = useState<AdminIngestionJobRunResponse | null>(initial.lastResult)
  const [activeJob, setActiveJob] = useState<AdminIngestionJobKey | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)

  const persist = useCallback(
    (nextRows: Record<AdminIngestionJobKey, RowUiState>, nextResult: AdminIngestionJobRunResponse | null) => {
      saveSessionState({
        rows: Object.fromEntries(
          ADMIN_INGESTION_JOB_DEFINITIONS.map((def) => [
            def.key,
            { lastDurationMs: nextRows[def.key]?.lastDurationMs ?? null },
          ])
        ),
        lastResult: nextResult,
      })
    },
    []
  )

  const runJob = useCallback(
    async (job: AdminIngestionJobKey) => {
      if (activeJob != null) return
      setPanelError(null)
      setActiveJob(job)
      setRows((prev) => ({
        ...prev,
        [job]: { ...prev[job], status: 'running' },
      }))

      try {
        const res = await fetch('/api/admin/ingestion/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job }),
        })
        const body = (await res.json()) as AdminIngestionJobRunResponse & { message?: string }
        const result: AdminIngestionJobRunResponse =
          body.job === job
            ? body
            : {
                ok: false,
                job,
                status: 'failed',
                duration_ms: 0,
                ran_at: new Date().toISOString(),
                error: body.message ?? `Request failed (${res.status})`,
              }

        setLastResult(result)
        setRows((prev) => {
          const next = {
            ...prev,
            [job]: {
              status: result.status,
              lastDurationMs: result.duration_ms,
            },
          }
          persist(next, result)
          return next
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const failed: AdminIngestionJobRunResponse = {
          ok: false,
          job,
          status: 'failed',
          duration_ms: 0,
          ran_at: new Date().toISOString(),
          error: message,
        }
        setLastResult(failed)
        setPanelError(message)
        setRows((prev) => {
          const next = {
            ...prev,
            [job]: { status: 'failed' as const, lastDurationMs: null },
          }
          persist(next, failed)
          return next
        })
      } finally {
        setActiveJob(null)
      }
    },
    [activeJob, persist]
  )

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Operations</h2>
      <p className="mt-1 text-sm text-slate-600">
        Manually invoke ingestion cron runners (admin auth). Jobs may take up to 5 minutes. Results are session-only.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="py-2 pr-4 font-medium">Job</th>
              <th className="py-2 pr-4 font-medium">Run</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 font-medium">Last duration</th>
            </tr>
          </thead>
          <tbody>
            {ADMIN_INGESTION_JOB_DEFINITIONS.map((def) => {
              const row = rows[def.key]
              const isRunning = activeJob === def.key
              return (
                <tr key={def.key} className="border-b border-slate-100 align-middle">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-900">{def.label}</div>
                    <div className="text-xs text-slate-500">{def.description}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      onClick={() => void runJob(def.key)}
                      disabled={activeJob != null}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isRunning ? 'Running…' : 'Run'}
                    </button>
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass(row.status)}`}
                    >
                      {badgeLabel(row.status)}
                    </span>
                  </td>
                  <td className="py-3 text-slate-700">{formatDuration(row.lastDurationMs)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {panelError && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {panelError}
        </p>
      )}

      <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Last execution result</h3>
        {!lastResult ? (
          <p className="mt-2 text-sm text-slate-500">No manual runs yet this session.</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm text-slate-800">
            <p>
              <span className="font-medium">Job:</span>{' '}
              {ADMIN_INGESTION_JOB_DEFINITIONS.find((d) => d.key === lastResult.job)?.label ?? lastResult.job}
            </p>
            <p>
              <span className="font-medium">Status:</span> {lastResult.status}
            </p>
            <p>
              <span className="font-medium">Timestamp:</span> {lastResult.ran_at}
            </p>
            <p>
              <span className="font-medium">Duration:</span> {formatDuration(lastResult.duration_ms)}
            </p>
            {lastResult.skipReason && (
              <p>
                <span className="font-medium">Skip reason:</span> {lastResult.skipReason}
              </p>
            )}
            {lastResult.status === 'failed' && (
              <>
                <p>
                  <span className="font-medium">Error:</span>{' '}
                  <span className="text-red-800">{lastResult.error ?? 'unknown_error'}</span>
                </p>
                {lastResult.stack_top && (
                  <p className="font-mono text-xs text-red-700">{lastResult.stack_top}</p>
                )}
              </>
            )}
            {lastResult.telemetry && lastResult.status !== 'failed' && (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium text-slate-700">Telemetry JSON</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs">
                  {JSON.stringify(lastResult.telemetry, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
