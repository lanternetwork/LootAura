'use client'

import { useCallback, useEffect, useState } from 'react'

const POLL_MS = 30_000
const API_PATH = '/api/admin/ingestion/coverage-tiered-scheduler'

export type CoverageTieredSchedulerState = {
  enabled: boolean
  enabledAt: string | null
  longTailCursor: number
  legacyCursor: number
}

type CoverageTieredSchedulerResponse = {
  ok?: boolean
  message?: string
  code?: string
  coverageTieredScheduler?: CoverageTieredSchedulerState
}

type ToggleUiState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'error'; message: string }

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

async function fetchTieredSchedulerState(): Promise<CoverageTieredSchedulerState> {
  const res = await fetch(API_PATH, { credentials: 'include' })
  const json = (await res.json()) as CoverageTieredSchedulerResponse
  if (!res.ok || !json.ok || !json.coverageTieredScheduler) {
    throw new Error(json.message || json.code || `HTTP ${res.status}`)
  }
  return json.coverageTieredScheduler
}

export default function CoverageTieredSchedulerCard() {
  const [state, setState] = useState<CoverageTieredSchedulerState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggleUi, setToggleUi] = useState<ToggleUiState>({ kind: 'idle' })

  const loadState = useCallback(async () => {
    try {
      const next = await fetchTieredSchedulerState()
      setState(next)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadState()
    const id = window.setInterval(() => void loadState(), POLL_MS)
    return () => window.clearInterval(id)
  }, [loadState])

  const toggleTieredScheduler = useCallback(
    async (enabled: boolean) => {
      if (
        enabled &&
        !window.confirm(
          'Enable tiered coverage audit scheduler? Prioritizes stale strategic metros (tier 1) then long-tail round-robin (tier 2). Stored in DB — no deploy or Vercel env change. Requires migration 218 and deployed tiered scheduler cron code.'
        )
      ) {
        return
      }

      setToggleUi({ kind: 'running' })
      try {
        const res = await fetch(API_PATH, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        })
        const json = (await res.json()) as CoverageTieredSchedulerResponse
        if (!res.ok || !json.ok || !json.coverageTieredScheduler) {
          throw new Error(json.message || json.code || `HTTP ${res.status}`)
        }
        setState(json.coverageTieredScheduler)
        setToggleUi({ kind: 'idle' })
        await loadState()
      } catch (e) {
        setToggleUi({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        })
      }
    },
    [loadState]
  )

  const enabled = state?.enabled === true

  return (
    <div
      className={`mb-4 rounded-md border p-4 ${
        enabled ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <h3 className="text-sm font-semibold text-slate-950">Coverage tiered audit scheduler</h3>
          <p className="mt-1 text-xs text-slate-700">
            DB flag on <code className="text-xs">ystm_coverage_audit</code>. Tier 1: stale strategic metros
            first. Tier 2: long-tail round-robin via <code className="text-xs">long_tail_cursor</code>. Legacy{' '}
            <code className="text-xs">cursor</code> is frozen while tiered mode is on.
          </p>
          {loading && !state && (
            <p className="mt-2 text-xs text-slate-600">Loading tiered scheduler state…</p>
          )}
          {loadError && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              Failed to load state: {loadError}
            </p>
          )}
          {state && (
            <>
              <p className="mt-2 text-xs text-slate-600">
                Status: <span className="font-semibold">{enabled ? 'ON' : 'OFF'}</span>
                {state.enabledAt && <> · enabled {formatWhen(state.enabledAt)}</>}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Legacy cursor (<code className="text-xs">cursor</code>):{' '}
                <span className="font-semibold tabular-nums">{state.legacyCursor.toLocaleString()}</span>
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Long-tail cursor (<code className="text-xs">long_tail_cursor</code>):{' '}
                <span className="font-semibold tabular-nums">{state.longTailCursor.toLocaleString()}</span>
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {enabled ? (
            <button
              type="button"
              disabled={toggleUi.kind === 'running' || !state}
              onClick={() => void toggleTieredScheduler(false)}
              className="rounded border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              Disable tiered scheduler
            </button>
          ) : (
            <button
              type="button"
              disabled={toggleUi.kind === 'running' || !state}
              onClick={() => void toggleTieredScheduler(true)}
              className="rounded border border-violet-600 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              Enable tiered scheduler
            </button>
          )}
        </div>
      </div>
      {toggleUi.kind === 'error' && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {toggleUi.message}
        </p>
      )}
    </div>
  )
}
