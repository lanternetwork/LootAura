import type { IngestionDiagnosticsPerformance } from '@/lib/admin/diagnostics/v4/types'

function formatPayloadBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes.toLocaleString()} B`
}

export function DiagnosticsPerformanceCard({
  performance,
}: {
  performance: IngestionDiagnosticsPerformance | undefined
}) {
  if (!performance) {
    return (
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Diagnostics Performance</h2>
        <p className="mt-2 text-sm text-gray-600">Timing data unavailable for this model.</p>
      </section>
    )
  }

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Diagnostics Performance</h2>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-gray-500">Total duration</dt>
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
        <div>
          <dt className="text-gray-500">Cache</dt>
          <dd className="font-medium">{performance.cache_status}</dd>
        </div>
      </dl>
    </section>
  )
}
