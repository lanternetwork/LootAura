'use client'

import { useState } from 'react'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { formatPayloadBytes } from '@/app/admin/ingestion/v2/dashboardUxHelpers'

export function CurrentSnapshotRow({ model }: { model: IngestionDiagnosticsModel }) {
  const [open, setOpen] = useState(false)
  const perf = model.performance

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-gray-900">Snapshot Details</span>
        <span className="text-xs font-medium text-gray-600">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100 px-5 py-3 text-xs text-gray-600">
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
      ) : null}
    </section>
  )
}
