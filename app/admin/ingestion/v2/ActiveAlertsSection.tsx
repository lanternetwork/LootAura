'use client'

import { useState } from 'react'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import {
  alertTone,
  countAlertsBySeverity,
  TONE_BG,
  TONE_BORDER,
  TONE_TEXT,
} from '@/app/admin/ingestion/v2/dashboardUxHelpers'

export function ActiveAlertsSection({ model }: { model: IngestionDiagnosticsModel }) {
  const [open, setOpen] = useState(false)
  const counts = countAlertsBySeverity(model.alerts)

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="text-base font-bold text-gray-900">Active Alerts</h2>
          {model.alerts.length === 0 ? (
            <p className="mt-1 text-sm text-emerald-800">No active operational alerts</p>
          ) : (
            <p className="mt-2 flex flex-wrap gap-3 text-sm">
              <span className="font-medium text-red-800">
                Critical <span className="tabular-nums">{counts.critical}</span>
              </span>
              <span className="font-medium text-amber-900">
                Warning <span className="tabular-nums">{counts.warning}</span>
              </span>
              <span className="font-medium text-gray-700">
                Info <span className="tabular-nums">{counts.info}</span>
              </span>
            </p>
          )}
        </div>
        <span className="text-xs font-medium text-gray-600">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open ? (
        <div className="border-t border-gray-200 px-5 pb-5 pt-4">
          {model.alerts.length === 0 ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              No active operational alerts.
            </div>
          ) : (
            <ul className="space-y-3">
              {model.alerts.map((alert) => {
                const tone = alertTone(alert.severity)
                return (
                  <li
                    key={alert.id}
                    className={`rounded-lg border p-4 ${TONE_BORDER[tone]} ${TONE_BG[tone]}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-bold uppercase ${TONE_TEXT[tone]}`}>
                        {alert.severity}
                      </span>
                      <span className="text-sm font-semibold">{alert.id.replace(/_/g, ' ')}</span>
                      <span className="rounded bg-white/70 px-1.5 py-0.5 text-xs text-gray-600">
                        {alert.confidence}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-800">{alert.reason || alert.trigger}</p>
                    <p className="mt-1 text-xs text-gray-600">Owner: {alert.owner}</p>
                    <p className="mt-2 text-sm text-gray-700">{alert.recommendedAction}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
