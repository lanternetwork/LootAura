import type { IngestionDiagnosticsPerformance } from '@/lib/admin/diagnostics/v4/types'
import { formatPayloadBytes } from '@/app/admin/ingestion/v2/dashboardUxHelpers'

export function DiagnosticsPerformanceCard({
  performance,
  compact = false,
}: {
  performance: IngestionDiagnosticsPerformance | undefined
  compact?: boolean
}) {
  if (!performance) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className={compact ? 'text-sm font-semibold' : 'text-lg font-semibold'}>
          Diagnostics Performance
        </h2>
        <p className="mt-2 text-sm text-gray-600">Timing data unavailable for this model.</p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className={compact ? 'text-sm font-semibold text-slate-800' : 'text-lg font-semibold'}>
        Diagnostics Performance
      </h2>
      <dl className={`mt-3 grid gap-2 text-sm ${compact ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        <div>
          <dt className="text-gray-500">Total build time</dt>
          <dd className="font-medium">{performance.total_duration_ms.toLocaleString()} ms</dd>
        </div>
        <div>
          <dt className="text-gray-500">Slowest stage</dt>
          <dd className="font-medium">
            {performance.slowest_stage} ({performance.slowest_stage_duration_ms.toLocaleString()} ms)
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Coverage duration</dt>
          <dd className="font-medium">
            {performance.coverage_scoreboard_duration_ms.toLocaleString()} ms
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Write count</dt>
          <dd className="font-medium">
            {performance.write_count.toLocaleString()}
            {performance.sequential_write_count > 0
              ? ` (${performance.sequential_write_count.toLocaleString()} sequential)`
              : ''}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Payload size</dt>
          <dd className="font-medium">{formatPayloadBytes(performance.json_payload_bytes)}</dd>
        </div>
        {!compact ? (
          <div>
            <dt className="text-gray-500">Cache</dt>
            <dd className="font-medium">{performance.cache_status}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}
