import {
  type StatusTone,
  TONE_BG,
  TONE_BORDER,
  TONE_TEXT,
} from '@/app/admin/ingestion/v2/dashboardUxHelpers'

const STATUS_DOT: Record<StatusTone, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
  blue: 'bg-indigo-500',
}

export function OperationalHealthCard({
  title,
  tone,
  statusLabel,
  primaryMetric,
  supportingMetric,
  threshold,
  summary,
}: {
  title: string
  tone: StatusTone
  statusLabel: string
  primaryMetric: string
  supportingMetric: string
  threshold: string
  summary: string
}) {
  return (
    <article
      className={`rounded-lg border p-5 shadow-sm ${TONE_BORDER[tone]} ${TONE_BG[tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`text-sm font-bold uppercase tracking-wide ${TONE_TEXT[tone]}`}>{title}</h3>
        <span
          className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${STATUS_DOT[tone]}`}
          aria-hidden
        />
      </div>
      <p className={`mt-3 text-sm font-semibold ${TONE_TEXT[tone]}`}>
        <span aria-hidden>{tone === 'green' ? '🟢' : tone === 'yellow' ? '🟡' : tone === 'red' ? '🔴' : '⚪'}</span>{' '}
        {statusLabel}
      </p>
      <p className={`mt-2 text-2xl font-bold tabular-nums leading-tight ${TONE_TEXT[tone]}`}>
        {primaryMetric}
      </p>
      <p className="mt-1 text-sm tabular-nums text-gray-700">{supportingMetric}</p>
      <p className="mt-2 text-xs text-gray-600">{threshold}</p>
      <p className="mt-2 text-sm leading-snug text-gray-700">{summary}</p>
    </article>
  )
}
