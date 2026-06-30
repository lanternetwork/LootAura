'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { buildDiagnosticsExport } from '@/lib/admin/diagnostics/v4/export/buildDiagnosticsExport'
import { copyTextToClipboard } from '@/lib/admin/copyTextToClipboard'
import { LiveOperationsSummary } from '@/app/admin/ingestion/v2/LiveOperationsSummary'
import { OperationalHealthCards } from '@/app/admin/ingestion/v2/OperationalHealthCards'
import { SloScoreboard } from '@/app/admin/ingestion/v2/SloScoreboard'
import { ActiveAlertsSection } from '@/app/admin/ingestion/v2/ActiveAlertsSection'
import { CurrentSnapshotRow } from '@/app/admin/ingestion/v2/CurrentSnapshotRow'
import { EngineeringDetailsSection } from '@/app/admin/ingestion/v2/EngineeringDetailsSection'

type ModelResponse = {
  ok: boolean
  model?: IngestionDiagnosticsModel
  message?: string
}

type CopyMode = 'operations' | 'engineering' | 'full'

const COPY_LABEL: Record<CopyMode, string> = {
  operations: 'Operations Report',
  engineering: 'Engineering Report',
  full: 'Full Diagnostics',
}

export default function IngestionDashboardV2Client() {
  const [model, setModel] = useState<IngestionDiagnosticsModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

  return (
    <div className="min-h-screen bg-gray-50 py-6 text-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Ingestion Operations</h1>
            <p className="mt-1 text-sm text-gray-600">Enterprise operations dashboard (v2)</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {(['operations', 'engineering', 'full'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void copyReport(mode)}
                className="rounded-md border border-indigo-400 bg-white px-3 py-1.5 text-sm font-medium text-indigo-900 shadow-sm hover:bg-indigo-50"
              >
                {copyState === mode
                  ? 'Copied'
                  : copyState === 'error'
                    ? 'Copy failed'
                    : COPY_LABEL[mode]}
              </button>
            ))}
            <Link
              href="/admin/ingestion"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-gray-50"
            >
              Legacy
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </header>

        <LiveOperationsSummary model={model} />
        <CurrentSnapshotRow model={model} />
        <OperationalHealthCards model={model} />
        <SloScoreboard model={model} />
        <ActiveAlertsSection model={model} />
        <EngineeringDetailsSection model={model} />
      </div>
    </div>
  )
}
