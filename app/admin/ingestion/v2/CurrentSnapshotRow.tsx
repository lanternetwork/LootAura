import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { formatPayloadBytes } from '@/app/admin/ingestion/v2/dashboardUxHelpers'

export function CurrentSnapshotRow({ model }: { model: IngestionDiagnosticsModel }) {
  const perf = model.performance

  return (
    <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs text-gray-600 shadow-sm">
      <span>
        <strong className="text-gray-800">Generated:</strong>{' '}
        {new Date(model.generatedAt).toLocaleString()}
      </span>
      <span>
        <strong className="text-gray-800">Environment:</strong> {model.environment}
      </span>
      <span>
        <strong className="text-gray-800">Build time:</strong>{' '}
        {perf ? `${perf.total_duration_ms.toLocaleString()} ms` : '—'}
      </span>
      <span>
        <strong className="text-gray-800">Payload:</strong>{' '}
        {formatPayloadBytes(perf?.json_payload_bytes)}
      </span>
      <span>
        <strong className="text-gray-800">Model:</strong> {model.diagnosticsModelVersion}
      </span>
    </div>
  )
}
