import type {
  IngestionDiagnosticsModel,
  SchedulerCronRow,
  SloEvaluationRow,
  SystemHealthLevel,
} from '@/lib/admin/diagnostics/v4/types'

export type StatusTone = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

export const TONE_BORDER: Record<StatusTone, string> = {
  green: 'border-emerald-300',
  yellow: 'border-amber-300',
  red: 'border-red-300',
  gray: 'border-gray-300',
  blue: 'border-indigo-300',
}

export const TONE_BG: Record<StatusTone, string> = {
  green: 'bg-emerald-50',
  yellow: 'bg-amber-50',
  red: 'bg-red-50',
  gray: 'bg-gray-50',
  blue: 'bg-indigo-50',
}

export const TONE_PILL: Record<StatusTone, string> = {
  green: 'bg-emerald-600 text-white',
  yellow: 'bg-amber-500 text-white',
  red: 'bg-red-600 text-white',
  gray: 'bg-gray-500 text-white',
  blue: 'bg-indigo-600 text-white',
}

export const TONE_TEXT: Record<StatusTone, string> = {
  green: 'text-emerald-800',
  yellow: 'text-amber-900',
  red: 'text-red-800',
  gray: 'text-gray-700',
  blue: 'text-indigo-900',
}

export const TONE_BORDER_STRONG: Record<StatusTone, string> = {
  green: 'border-2 border-emerald-500',
  yellow: 'border-2 border-amber-500',
  red: 'border-2 border-red-600',
  gray: 'border-2 border-gray-400',
  blue: 'border-2 border-indigo-500',
}

export const SLO_ROW_BG: Record<StatusTone, string> = {
  green: 'bg-emerald-50/80',
  yellow: 'bg-amber-50/80',
  red: 'bg-red-50/80',
  gray: '',
  blue: '',
}

export function healthTone(level: SystemHealthLevel): StatusTone {
  switch (level) {
    case 'healthy':
      return 'green'
    case 'degraded':
      return 'yellow'
    case 'critical':
      return 'red'
  }
}

export function sloTone(slo: SloEvaluationRow): StatusTone {
  if (slo.pass) return 'green'
  if (slo.blocking) return 'red'
  return 'yellow'
}

export function alertTone(severity: 'critical' | 'warning' | 'info'): StatusTone {
  switch (severity) {
    case 'critical':
      return 'red'
    case 'warning':
      return 'yellow'
    case 'info':
      return 'gray'
  }
}

export function findSlo(model: IngestionDiagnosticsModel, id: string): SloEvaluationRow | undefined {
  return model.slos.find((slo) => slo.id === id)
}

export function findDomain(model: IngestionDiagnosticsModel, id: string) {
  return model.domainHealth.find((domain) => domain.id === id)
}

export function healthStatusEmoji(level: SystemHealthLevel): string {
  switch (level) {
    case 'healthy':
      return '🟢'
    case 'degraded':
      return '🟡'
    case 'critical':
      return '🔴'
  }
}

export function statusLabelForTone(tone: StatusTone): string {
  switch (tone) {
    case 'green':
      return 'Healthy'
    case 'yellow':
      return 'Needs Attention'
    case 'red':
      return 'Critical'
    case 'gray':
      return 'Monitoring'
    case 'blue':
      return 'Info'
  }
}

/** Presentation-only: capitalize and soften common passive phrasing. */
export function formatRecommendationDisplay(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  let result = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  if (/^address\b/i.test(result)) {
    result = `Review${result.slice(7)}`
  }
  return result
}

export function resolveTopRecommendation(model: IngestionDiagnosticsModel): string {
  const primary = model.operatorActions[0]?.action
  if (primary) return primary

  const domainAction = model.domainHealth.find(
    (domain) => domain.domain === model.primaryBottleneck.domain
  )?.recommendedAction
  if (domainAction) return domainAction

  const alertAction = model.alerts[0]?.recommendedAction
  if (alertAction) return alertAction

  return model.primaryBottleneck.reason
}

export function resolveInventorySubtitle(model: IngestionDiagnosticsModel): string {
  const published24h = model.metrics.published24h
  const publishSlo = findSlo(model, 'publish_failed_terminal')

  if (published24h > 0 && (!publishSlo || publishSlo.pass)) {
    return 'Inventory flowing normally'
  }
  if (publishSlo && !publishSlo.pass) {
    return `Publish pressure: ${publishSlo.actual} (target ${publishSlo.target})`
  }
  if (published24h === 0) {
    return 'No publishes in last 24h'
  }
  return 'Review publish pipeline'
}

export function pipelineCardTone(model: IngestionDiagnosticsModel): StatusTone {
  const parser = findSlo(model, 'parser_success_24h')
  const publish = findSlo(model, 'publish_failed_terminal')

  if (parser && !parser.pass && parser.blocking) return 'red'
  if (publish && !publish.pass && publish.blocking) return 'red'
  if (parser && !parser.pass) return 'yellow'
  if (publish && !publish.pass) return 'yellow'
  return 'green'
}

export function pipelineCardMetric(model: IngestionDiagnosticsModel): string {
  const parser = findSlo(model, 'parser_success_24h')
  const publish = findSlo(model, 'publish_failed_terminal')
  const parserActual = parser?.actual ?? '—'
  const publishActual = publish?.actual ?? '—'
  return `Parser ${parserActual} · Publish failed ${publishActual}`
}

export function pipelineCardPrimaryMetric(model: IngestionDiagnosticsModel): string {
  const parser = findSlo(model, 'parser_success_24h')
  return `Parser ${parser?.actual ?? '—'}`
}

export function pipelineCardSupportingMetric(model: IngestionDiagnosticsModel): string {
  const publish = findSlo(model, 'publish_failed_terminal')
  return `Publish failures: ${publish?.actual ?? '—'}`
}

export function pipelineCardThreshold(model: IngestionDiagnosticsModel): string {
  const parser = findSlo(model, 'parser_success_24h')
  const publish = findSlo(model, 'publish_failed_terminal')
  return `Parser ${parser?.target ?? '—'} · Publish ${publish?.target ?? '—'}`
}

export function pipelineCardSummary(model: IngestionDiagnosticsModel): string {
  const tone = pipelineCardTone(model)
  if (tone === 'green') return 'Hot-path ingestion healthy'
  if (tone === 'red') return 'Blocking hot-path failure'
  return 'Hot-path needs attention'
}

export function schedulerHealthyCount(crons: readonly SchedulerCronRow[]): number {
  return crons.filter((cron) => cron.state === 'ok').length
}

export function schedulerCardTone(model: IngestionDiagnosticsModel): StatusTone {
  const domain = findDomain(model, 'scheduler')
  return domain ? healthTone(domain.status) : 'gray'
}

export function bottleneckCountLabel(model: IngestionDiagnosticsModel): string | null {
  const pressure = model.primaryBottleneck.secondaryPressures[0]
  if (!pressure) return null
  return `${pressure.count.toLocaleString()} ${pressure.label}`
}

export function formatPayloadBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes.toLocaleString()} B`
}

export function countAlertsBySeverity(
  alerts: IngestionDiagnosticsModel['alerts']
): { critical: number; warning: number; info: number } {
  return alerts.reduce(
    (acc, alert) => {
      acc[alert.severity] += 1
      return acc
    },
    { critical: 0, warning: 0, info: 0 }
  )
}

/** One-line operational summary — distinct from hero health reason. */
export function composeCurrentStatusSentence(model: IngestionDiagnosticsModel): string {
  const parts: string[] = []
  const heroReason = model.healthReasons[0]?.label?.trim() ?? ''

  if (model.systemHealth === 'healthy') {
    parts.push('Pipeline operating normally.')
  } else {
    parts.push(`${model.primaryBottleneck.label}.`)
  }

  const trend = model.trendSummary.trim()
  if (trend && !trend.startsWith('Trend unavailable')) {
    const trendSentence = trend.endsWith('.') ? trend : `${trend}.`
    if (!heroReason || !trendSentence.toLowerCase().includes(heroReason.toLowerCase().slice(0, 12))) {
      parts.push(trendSentence)
    }
  }

  const inventory = resolveInventorySubtitle(model)
  if (inventory !== 'Inventory flowing normally') {
    parts.push(inventory.endsWith('.') ? inventory : `${inventory}.`)
  }

  const recommendation = formatRecommendationDisplay(resolveTopRecommendation(model))
  if (
    recommendation &&
    recommendation !== heroReason &&
    !parts.some((part) => part.toLowerCase().includes(recommendation.toLowerCase().slice(0, 16)))
  ) {
    parts.push(recommendation.endsWith('.') ? recommendation : `${recommendation}.`)
  }

  return parts.slice(0, 3).join(' ') || 'Review operational health cards for detail.'
}
