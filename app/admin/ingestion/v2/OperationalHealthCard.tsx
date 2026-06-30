import type { StatusTone } from '@/app/admin/ingestion/v2/dashboardUxHelpers'
import { TONE_BG, TONE_BORDER, TONE_TEXT } from '@/app/admin/ingestion/v2/dashboardUxHelpers'

const STATUS_DOT: Record<StatusTone, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
  blue: 'bg-indigo-500',
}

export function OperationalHealthCard({
  title,
  subtitle,
  tone,
  metric,
  threshold,
  summary,
}: {
  title: string
  subtitle?: string
  tone: StatusTone
  metric: string
  threshold: string
  summary: string
}) {
  return (
    <article
      className={`rounded-lg border p-4 shadow-sm ${TONE_BORDER[tone]} ${TONE_BG[tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className={`text-sm font-semibold ${TONE_TEXT[tone]}`}>{title}</h3>
          {subtitle ? <p className="text-xs text-gray-600">{subtitle}</p> : null}
        </div>
        <span
          className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${STATUS_DOT[tone]}`}
          aria-hidden
        />
      </div>
      <p className={`mt-3 text-2xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{metric}</p>
      <p className="mt-1 text-xs text-gray-600">Target: {threshold}</p>
      <p className="mt-2 text-sm text-gray-700">{summary}</p>
    </article>
  )
}
