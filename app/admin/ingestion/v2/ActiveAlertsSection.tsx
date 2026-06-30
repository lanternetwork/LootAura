import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import {
  alertTone,
  TONE_BG,
  TONE_BORDER,
  TONE_TEXT,
} from '@/app/admin/ingestion/v2/dashboardUxHelpers'

export function ActiveAlertsSection({ model }: { model: IngestionDiagnosticsModel }) {
  return (
    <section className="mb-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
        Active Alerts
      </h2>
      {model.alerts.length === 0 ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          No active operational alerts.
        </div>
      ) : (
        <ul className="space-y-2">
          {model.alerts.map((alert) => {
            const tone = alertTone(alert.severity)
            return (
              <li
                key={alert.id}
                className={`rounded-lg border p-3 ${TONE_BORDER[tone]} ${TONE_BG[tone]}`}
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
                <p className="mt-1 text-sm text-gray-800">{alert.reason || alert.trigger}</p>
                <p className="mt-1 text-xs text-gray-600">Owner: {alert.owner}</p>
                <p className="mt-1 text-sm text-gray-700">{alert.recommendedAction}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
