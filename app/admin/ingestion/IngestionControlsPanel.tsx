'use client'

import { useCallback, useState } from 'react'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import IngestionWorkstreamsPanel from '@/app/admin/ingestion/IngestionWorkstreamsPanel'
import YstmCoverageScoreboardSection from '@/app/admin/ingestion/YstmCoverageScoreboardSection'

type Props = {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  coverageLoading: boolean
  coverageError: string | null
  onCoverageRefresh: () => void | Promise<void>
  metricsLoading: boolean
  onResetMetricsBaseline: () => void | Promise<void>
  baselineState: 'idle' | 'loading' | 'done' | 'error'
  baselineError: string | null
  onOpenDebug?: () => void
}

export default function IngestionControlsPanel({
  metrics,
  coverage,
  coverageLoading,
  coverageError,
  onCoverageRefresh,
  metricsLoading,
  onResetMetricsBaseline,
  baselineState,
  baselineError,
  onOpenDebug,
}: Props) {
  const [localBaselineError, setLocalBaselineError] = useState<string | null>(null)

  const handleReset = useCallback(async () => {
    setLocalBaselineError(null)
    try {
      await onResetMetricsBaseline()
    } catch (e) {
      setLocalBaselineError(e instanceof Error ? e.message : String(e))
    }
  }, [onResetMetricsBaseline])

  const displayBaselineError = baselineError ?? localBaselineError

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Metrics window</h2>
        <p className="mt-1 text-sm text-slate-600">
          Clears the post-deploy detail-first funnel baseline. Crawlable registry totals are live counts and do not
          zero out.
        </p>
        <button
          type="button"
          onClick={() => void handleReset()}
          disabled={metricsLoading || baselineState === 'loading'}
          className="mt-4 rounded-md border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {baselineState === 'loading'
            ? 'Resetting…'
            : baselineState === 'done'
              ? 'Metrics window cleared'
              : baselineState === 'error'
                ? 'Reset failed'
                : 'Clear post-deploy metrics window'}
        </button>
        {displayBaselineError && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {displayBaselineError}
          </p>
        )}
      </section>

      <IngestionWorkstreamsPanel
        metrics={metrics}
        coverage={coverage}
        onOpenDebug={onOpenDebug}
      />

      <YstmCoverageScoreboardSection
        variant="controls"
        coverage={coverage}
        coverageLoading={coverageLoading}
        coverageError={coverageError}
        onCoverageRefresh={onCoverageRefresh}
      />
    </div>
  )
}
