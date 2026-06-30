import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { formatSystemHealthLabel } from '@/lib/admin/diagnostics/v4/systemHealth'
import {
  bottleneckCountLabel,
  composeCurrentStatusSentence,
  formatRecommendationDisplay,
  healthStatusEmoji,
  healthTone,
  resolveTopRecommendation,
  TONE_BG,
  TONE_BORDER_STRONG,
  TONE_TEXT,
} from '@/app/admin/ingestion/v2/dashboardUxHelpers'

export function LiveOperationsSummary({ model }: { model: IngestionDiagnosticsModel }) {
  const tone = healthTone(model.systemHealth)
  const bottleneck = model.primaryBottleneck
  const countLabel = bottleneckCountLabel(model)
  const heroSummary = model.healthReasons[0]?.label ?? 'System operating normally.'
  const recommendation = formatRecommendationDisplay(resolveTopRecommendation(model))

  return (
    <section className="mb-6 space-y-4">
      <article
        className={`rounded-xl p-6 shadow-md ${TONE_BORDER_STRONG[tone]} ${TONE_BG[tone]}`}
        aria-label="System status"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-gray-600">System Status</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-4xl leading-none" aria-hidden>
            {healthStatusEmoji(model.systemHealth)}
          </span>
          <span className={`text-3xl font-bold tracking-tight ${TONE_TEXT[tone]}`}>
            {formatSystemHealthLabel(model.systemHealth)}
          </span>
        </div>
        <p className={`mt-4 max-w-3xl text-lg leading-snug ${TONE_TEXT[tone]}`}>{heroSummary}</p>
      </article>

      <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50 px-5 py-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">Recommended action</p>
        <p className="mt-2 text-base font-medium leading-snug text-indigo-950">{recommendation}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
        <div>
          <span className="font-semibold tabular-nums text-gray-900">
            {model.metrics.published24h.toLocaleString()}
          </span>
          <span className="text-gray-600"> published (24h)</span>
        </div>
        <span className="hidden text-gray-300 sm:inline" aria-hidden>
          |
        </span>
        <div>
          <span className="font-semibold text-gray-900">{bottleneck.label}</span>
          <span className="text-gray-600"> · primary bottleneck</span>
          {countLabel ? (
            <span className="text-gray-600"> · {countLabel}</span>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Current Status</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-800">
          {composeCurrentStatusSentence(model)}
        </p>
      </div>
    </section>
  )
}
