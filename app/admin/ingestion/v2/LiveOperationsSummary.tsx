import type { ReactNode } from 'react'
import type { IngestionDiagnosticsModel } from '@/lib/admin/diagnostics/v4/types'
import { formatSystemHealthLabel } from '@/lib/admin/diagnostics/v4/systemHealth'
import {
  bottleneckCountLabel,
  healthTone,
  resolveInventorySubtitle,
  resolveTopRecommendation,
  TONE_BG,
  TONE_BORDER,
  TONE_PILL,
  TONE_TEXT,
} from '@/app/admin/ingestion/v2/dashboardUxHelpers'

function SummaryTile({
  title,
  tone,
  children,
}: {
  title: string
  tone: ReturnType<typeof healthTone>
  children: ReactNode
}) {
  return (
    <article className={`rounded-lg border p-4 shadow-sm ${TONE_BORDER[tone]} ${TONE_BG[tone]}`}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h2>
      <div className="mt-3">{children}</div>
    </article>
  )
}

export function LiveOperationsSummary({ model }: { model: IngestionDiagnosticsModel }) {
  const healthToneValue = healthTone(model.systemHealth)
  const bottleneck = model.primaryBottleneck
  const countLabel = bottleneckCountLabel(model)

  return (
    <section className="mb-4 grid gap-4 lg:grid-cols-4">
      <SummaryTile title="Overall Health" tone={healthToneValue}>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${TONE_PILL[healthToneValue]}`}
        >
          {formatSystemHealthLabel(model.systemHealth)}
        </span>
        <p className={`mt-3 text-sm ${TONE_TEXT[healthToneValue]}`}>
          {model.healthReasons[0]?.label ?? 'No active health warnings'}
        </p>
      </SummaryTile>

      <SummaryTile title="Inventory Flow" tone={model.metrics.published24h > 0 ? 'green' : 'yellow'}>
        <p className="text-3xl font-bold tabular-nums">{model.metrics.published24h.toLocaleString()}</p>
        <p className="text-sm text-gray-600">Published (24h)</p>
        <p className="mt-2 text-sm text-gray-700">{resolveInventorySubtitle(model)}</p>
      </SummaryTile>

      <SummaryTile title="Primary Bottleneck" tone={healthToneValue === 'healthy' ? 'gray' : healthToneValue}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {bottleneck.type.replace(/_/g, ' ')}
        </p>
        <p className="mt-1 text-lg font-semibold">{bottleneck.label}</p>
        {countLabel ? (
          <p className="text-sm font-medium tabular-nums text-gray-800">{countLabel}</p>
        ) : null}
        <p className="mt-2 text-sm text-gray-700">{bottleneck.reason}</p>
      </SummaryTile>

      <SummaryTile title="Top Recommendation" tone="blue">
        <p className="text-sm leading-relaxed text-indigo-950">{resolveTopRecommendation(model)}</p>
      </SummaryTile>
    </section>
  )
}
