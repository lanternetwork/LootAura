import {
  type AdaptiveCaps,
  type AdaptiveSubsystem,
  type AdaptiveSubsystemProfile,
  buildStaticThroughputEnvelope,
  isAdaptiveThroughputEnabled,
  knobsForSubsystemProfile,
  loadAdaptiveCaps,
  type FetchKnobProfile,
  type GeocodeKnobProfile,
  type PublishKnobProfile,
} from '@/lib/ingestion/adaptiveThroughputConfig'
import { GEOCODE_STALE_CRITICAL_MS, PUBLISH_STALE_CRITICAL_MS } from '@/lib/admin/ingestionVolumeMetricsConfig'

export type AdaptivePressureSignals = {
  metricsAvailable: boolean
  metricsStale: boolean
  needsGeocodeCount: number
  oldestNeedsGeocodeAgeMs: number | null
  readyCount: number
  oldestReadyAgeMs: number | null
  crawlableConfigsTotal: number
  configsDueForCrawl: number
  configsOverdue: number
  fetchFailureRate24h: number | null
  fetchBudgetExitCount24h: number
  rate429Count24h: number
  geocodeRetryableFailed24h: number
  geocodeTerminalFailed24h: number
  publishFailed24h: number
  publishAttempted24h: number
  recentOrchestrationDurationMsAvg: number | null
  recentFetchBudgetExitRuns: number
  recentOrchestrationErrorRuns: number
  fetchHealthyForElevation: boolean
}

export type AdaptiveDwellState = {
  subsystemProfiles: Record<AdaptiveSubsystem, AdaptiveSubsystemProfile>
  dwellRemaining: Record<AdaptiveSubsystem, number>
  aggregateProfile: string
}

export type AdaptiveThroughputEnvelope = {
  fetch: FetchKnobProfile
  geocode: GeocodeKnobProfile
  publish: PublishKnobProfile
}

export type AdaptiveThroughputNoteFields = {
  adaptiveEnabled: boolean
  adaptiveProfile: string
  previousAdaptiveProfile?: string
  profileReason: string
  subsystemProfiles: Record<AdaptiveSubsystem, AdaptiveSubsystemProfile>
  effectiveConfigBatchSize: number
  effectiveExecutionBudgetMs: number
  effectiveMinIntervalMinutes: number
  effectiveDomainSpacingMs: number
  effectiveGeocodeBacklogBatchSize: number
  effectiveGeocodeQueueBatchSize: number
  effectiveGeocodeConcurrencyCeiling: number
  effectivePublishBatchSize: number
  pressureSignals: string[]
  backoffReason?: string
  dwellRemaining?: Record<AdaptiveSubsystem, number>
}

const PROFILE_RANK: Record<AdaptiveSubsystemProfile, number> = {
  conservative: 0,
  normal: 1,
  elevated: 2,
  recovery: -1,
}

const ELEVATED_GEOCODE_BACKLOG_COUNT = 50
const ELEVATED_GEOCODE_AGE_MS = GEOCODE_STALE_CRITICAL_MS / 2
const ELEVATED_PUBLISH_READY_COUNT = 30
const ELEVATED_PUBLISH_AGE_MS = PUBLISH_STALE_CRITICAL_MS / 2

const RECOVERY_RATE_429_THRESHOLD = 10
const RECOVERY_GEOCODE_RETRYABLE_THRESHOLD = 50
const RECOVERY_BUDGET_EXIT_24H = 3
const RECOVERY_DURATION_MS = 50_000
const RECOVERY_PUBLISH_FAIL_RATE = 0.15

function emptyDwell(): AdaptiveDwellState {
  return {
    subsystemProfiles: { fetch: 'normal', geocode: 'normal', publish: 'normal' },
    dwellRemaining: { fetch: 0, geocode: 0, publish: 0 },
    aggregateProfile: 'normal',
  }
}

export function parseAdaptiveDwellFromNotes(
  notes: Record<string, unknown> | null | undefined
): AdaptiveDwellState | null {
  if (!notes || typeof notes !== 'object') return null
  const adaptive = (notes as { adaptive?: Record<string, unknown> }).adaptive
  if (!adaptive || typeof adaptive !== 'object') return null
  const sub = adaptive.subsystemProfiles as Record<string, string> | undefined
  const dwell = adaptive.dwellRemaining as Record<string, number> | undefined
  if (!sub) return null
  const parseSub = (key: AdaptiveSubsystem): AdaptiveSubsystemProfile => {
    const v = sub[key]
    if (v === 'conservative' || v === 'normal' || v === 'elevated' || v === 'recovery') return v
    return 'normal'
  }
  return {
    subsystemProfiles: {
      fetch: parseSub('fetch'),
      geocode: parseSub('geocode'),
      publish: parseSub('publish'),
    },
    dwellRemaining: {
      fetch: typeof dwell?.fetch === 'number' ? Math.max(0, dwell.fetch) : 0,
      geocode: typeof dwell?.geocode === 'number' ? Math.max(0, dwell.geocode) : 0,
      publish: typeof dwell?.publish === 'number' ? Math.max(0, dwell.publish) : 0,
    },
    aggregateProfile: typeof adaptive.adaptiveProfile === 'string' ? adaptive.adaptiveProfile : 'normal',
  }
}

function deriveFetchDesired(signals: AdaptivePressureSignals): { profile: AdaptiveSubsystemProfile; reasons: string[] } {
  const reasons: string[] = []
  if (
    signals.rate429Count24h >= RECOVERY_RATE_429_THRESHOLD ||
    signals.fetchBudgetExitCount24h >= RECOVERY_BUDGET_EXIT_24H ||
    signals.recentFetchBudgetExitRuns >= 2 ||
    (signals.recentOrchestrationDurationMsAvg != null &&
      signals.recentOrchestrationDurationMsAvg >= RECOVERY_DURATION_MS) ||
    signals.recentOrchestrationErrorRuns >= 2
  ) {
    reasons.push('fetch_stress')
    return { profile: 'recovery', reasons }
  }
  if (!signals.metricsAvailable || signals.metricsStale) {
    reasons.push('metrics_unavailable')
    return { profile: 'conservative', reasons }
  }
  if (signals.configsOverdue > 0 && signals.fetchHealthyForElevation) {
    reasons.push('fetch_overdue_healthy')
    return { profile: 'elevated', reasons }
  }
  if (
    (signals.configsDueForCrawl > 0 || signals.configsOverdue > 0) &&
    !signals.fetchHealthyForElevation
  ) {
    reasons.push('fetch_backlog_not_confirmed')
    return { profile: 'normal', reasons }
  }
  return { profile: 'normal', reasons }
}

function deriveGeocodeDesired(signals: AdaptivePressureSignals): { profile: AdaptiveSubsystemProfile; reasons: string[] } {
  const reasons: string[] = []
  if (
    signals.rate429Count24h >= RECOVERY_RATE_429_THRESHOLD ||
    signals.geocodeRetryableFailed24h >= RECOVERY_GEOCODE_RETRYABLE_THRESHOLD
  ) {
    reasons.push('geocode_stress')
    return { profile: 'recovery', reasons }
  }
  if (!signals.metricsAvailable || signals.metricsStale) {
    reasons.push('metrics_unavailable')
    return { profile: 'conservative', reasons }
  }
  const backlogPressure =
    signals.needsGeocodeCount >= ELEVATED_GEOCODE_BACKLOG_COUNT ||
    (signals.oldestNeedsGeocodeAgeMs != null && signals.oldestNeedsGeocodeAgeMs >= ELEVATED_GEOCODE_AGE_MS)
  if (backlogPressure && signals.rate429Count24h < 5) {
    reasons.push('geocode_backlog')
    return { profile: 'elevated', reasons }
  }
  return { profile: 'normal', reasons }
}

function derivePublishDesired(signals: AdaptivePressureSignals): { profile: AdaptiveSubsystemProfile; reasons: string[] } {
  const reasons: string[] = []
  const failRate =
    signals.publishAttempted24h > 0 ? signals.publishFailed24h / signals.publishAttempted24h : 0
  if (
    failRate >= RECOVERY_PUBLISH_FAIL_RATE ||
    signals.recentOrchestrationErrorRuns >= 2
  ) {
    reasons.push('publish_stress')
    return { profile: 'recovery', reasons }
  }
  if (!signals.metricsAvailable || signals.metricsStale) {
    reasons.push('metrics_unavailable')
    return { profile: 'conservative', reasons }
  }
  const backlogPressure =
    signals.readyCount >= ELEVATED_PUBLISH_READY_COUNT ||
    (signals.oldestReadyAgeMs != null && signals.oldestReadyAgeMs >= ELEVATED_PUBLISH_AGE_MS)
  const geocodeHealthy =
    signals.rate429Count24h < 5 && signals.geocodeRetryableFailed24h < 25
  if (backlogPressure && geocodeHealthy) {
    reasons.push('publish_backlog')
    return { profile: 'elevated', reasons }
  }
  return { profile: 'normal', reasons }
}

function applyHysteresisForSubsystem(
  _subsystem: AdaptiveSubsystem,
  previous: AdaptiveSubsystemProfile,
  desired: AdaptiveSubsystemProfile,
  dwellRemaining: number,
  caps: AdaptiveCaps
): { profile: AdaptiveSubsystemProfile; dwellRemaining: number } {
  if (desired === 'recovery') {
    return { profile: 'recovery', dwellRemaining: caps.recoveryDwellRuns }
  }

  let profile: AdaptiveSubsystemProfile = desired

  if (previous === 'recovery') {
    if (dwellRemaining > 0) {
      return { profile: 'recovery', dwellRemaining: dwellRemaining - 1 }
    }
    profile = 'conservative'
  }

  if (PROFILE_RANK[profile] > PROFILE_RANK[previous] + 1) {
    profile = PROFILE_RANK[previous] === 0 ? 'normal' : 'elevated'
  }

  if (profile === 'elevated' && previous !== 'elevated') {
    return { profile, dwellRemaining: caps.elevatedDwellRuns }
  }

  if (previous === 'elevated' && profile === 'normal' && dwellRemaining > 0) {
    return { profile: 'elevated', dwellRemaining: dwellRemaining - 1 }
  }

  return { profile, dwellRemaining: profile === 'elevated' ? dwellRemaining : 0 }
}

function aggregateAdaptiveLabel(profiles: Record<AdaptiveSubsystem, AdaptiveSubsystemProfile>): string {
  const values = [profiles.fetch, profiles.geocode, profiles.publish]
  const unique = new Set(values)
  if (unique.size === 1) return values[0]!
  if (values.includes('recovery')) return 'mixed_recovery'
  if (values.includes('elevated')) return 'mixed_elevated'
  return 'mixed'
}

export function resolveAdaptiveThroughput(params: {
  signals: AdaptivePressureSignals
  previousDwell: AdaptiveDwellState | null
  caps?: AdaptiveCaps
}): {
  envelope: AdaptiveThroughputEnvelope
  note: AdaptiveThroughputNoteFields
} {
  if (!isAdaptiveThroughputEnabled()) {
    const staticEnv = buildStaticThroughputEnvelope()
    return {
      envelope: staticEnv,
      note: buildNoteFromEnvelope(staticEnv, {
        adaptiveEnabled: false,
        subsystemProfiles: { fetch: 'normal', geocode: 'normal', publish: 'normal' },
        profileReason: 'adaptive_disabled',
        pressureSignals: [],
        previousAggregate: params.previousDwell?.aggregateProfile,
      }),
    }
  }

  const caps = params.caps ?? loadAdaptiveCaps()
  const prev = params.previousDwell ?? emptyDwell()
  const signals = params.signals

  const fetchDesired = deriveFetchDesired(signals)
  const geocodeDesired = deriveGeocodeDesired(signals)
  const publishDesired = derivePublishDesired(signals)

  const fetchH = applyHysteresisForSubsystem(
    'fetch',
    prev.subsystemProfiles.fetch,
    fetchDesired.profile,
    prev.dwellRemaining.fetch,
    caps
  )
  const geocodeH = applyHysteresisForSubsystem(
    'geocode',
    prev.subsystemProfiles.geocode,
    geocodeDesired.profile,
    prev.dwellRemaining.geocode,
    caps
  )
  const publishH = applyHysteresisForSubsystem(
    'publish',
    prev.subsystemProfiles.publish,
    publishDesired.profile,
    prev.dwellRemaining.publish,
    caps
  )

  const subsystemProfiles: Record<AdaptiveSubsystem, AdaptiveSubsystemProfile> = {
    fetch: fetchH.profile,
    geocode: geocodeH.profile,
    publish: publishH.profile,
  }

  const envelope: AdaptiveThroughputEnvelope = {
    fetch: knobsForSubsystemProfile('fetch', subsystemProfiles.fetch, caps) as FetchKnobProfile,
    geocode: knobsForSubsystemProfile('geocode', subsystemProfiles.geocode, caps) as GeocodeKnobProfile,
    publish: knobsForSubsystemProfile('publish', subsystemProfiles.publish, caps) as PublishKnobProfile,
  }

  const pressureSignals = [
    ...fetchDesired.reasons,
    ...geocodeDesired.reasons,
    ...publishDesired.reasons,
  ].filter((v, i, a) => a.indexOf(v) === i)

  const backoffReason =
    subsystemProfiles.fetch === 'recovery' ||
    subsystemProfiles.geocode === 'recovery' ||
    subsystemProfiles.publish === 'recovery'
      ? pressureSignals.find((r) => r.includes('stress') || r.includes('metrics')) ?? 'recovery_profile'
      : undefined

  return {
    envelope,
    note: buildNoteFromEnvelope(envelope, {
      adaptiveEnabled: true,
      subsystemProfiles,
      profileReason: pressureSignals.join(',') || 'steady_state',
      pressureSignals,
      backoffReason,
      previousAggregate: prev.aggregateProfile,
      dwellRemaining: {
        fetch: fetchH.dwellRemaining,
        geocode: geocodeH.dwellRemaining,
        publish: publishH.dwellRemaining,
      },
    }),
  }
}

function buildNoteFromEnvelope(
  envelope: AdaptiveThroughputEnvelope,
  meta: {
    adaptiveEnabled: boolean
    subsystemProfiles: Record<AdaptiveSubsystem, AdaptiveSubsystemProfile>
    profileReason: string
    pressureSignals: string[]
    backoffReason?: string
    previousAggregate?: string
    dwellRemaining?: Record<AdaptiveSubsystem, number>
  }
): AdaptiveThroughputNoteFields {
  const aggregate = aggregateAdaptiveLabel(meta.subsystemProfiles)
  return {
    adaptiveEnabled: meta.adaptiveEnabled,
    adaptiveProfile: aggregate,
    previousAdaptiveProfile: meta.previousAggregate,
    profileReason: meta.profileReason,
    subsystemProfiles: meta.subsystemProfiles,
    effectiveConfigBatchSize: envelope.fetch.configBatchSize,
    effectiveExecutionBudgetMs: envelope.fetch.executionBudgetMs,
    effectiveMinIntervalMinutes: envelope.fetch.minIntervalMinutes,
    effectiveDomainSpacingMs: envelope.fetch.domainSpacingMs,
    effectiveGeocodeBacklogBatchSize: envelope.geocode.backlogBatchSize,
    effectiveGeocodeQueueBatchSize: envelope.geocode.queueBatchSize,
    effectiveGeocodeConcurrencyCeiling: envelope.geocode.concurrencyCeiling,
    effectivePublishBatchSize: envelope.publish.batchSize,
    pressureSignals: meta.pressureSignals,
    backoffReason: meta.backoffReason,
    dwellRemaining: meta.dwellRemaining,
  }
}

/** Build `notes.adaptive` payload for orchestration run rows. */
export function extractLatestAdaptiveNoteFromOrchestrationRows(
  rows: Array<{ notes: Record<string, unknown> | null }>
): Record<string, unknown> | null {
  for (const row of rows) {
    const notes = row.notes
    if (!notes || typeof notes !== 'object') continue
    const top = notes.adaptive
    if (top && typeof top === 'object') return top as Record<string, unknown>
    const ext = notes.external_ingestion as { adaptive?: unknown } | undefined
    if (ext?.adaptive && typeof ext.adaptive === 'object') {
      return ext.adaptive as Record<string, unknown>
    }
    const gc = notes.geocode_cron as { adaptive?: unknown } | undefined
    if (gc?.adaptive && typeof gc.adaptive === 'object') {
      return gc.adaptive as Record<string, unknown>
    }
  }
  return null
}

export function adaptiveNoteToOrchestrationPayload(
  note: AdaptiveThroughputNoteFields
): Record<string, unknown> {
  return {
    adaptiveProfile: note.adaptiveProfile,
    previousAdaptiveProfile: note.previousAdaptiveProfile,
    profileReason: note.profileReason,
    subsystemProfiles: note.subsystemProfiles,
    dwellRemaining: note.dwellRemaining,
    effectiveConfigBatchSize: note.effectiveConfigBatchSize,
    effectiveExecutionBudgetMs: note.effectiveExecutionBudgetMs,
    effectiveMinIntervalMinutes: note.effectiveMinIntervalMinutes,
    effectiveDomainSpacingMs: note.effectiveDomainSpacingMs,
    effectiveGeocodeBacklogBatchSize: note.effectiveGeocodeBacklogBatchSize,
    effectiveGeocodeQueueBatchSize: note.effectiveGeocodeQueueBatchSize,
    effectiveGeocodeConcurrencyCeiling: note.effectiveGeocodeConcurrencyCeiling,
    effectivePublishBatchSize: note.effectivePublishBatchSize,
    pressureSignals: note.pressureSignals,
    backoffReason: note.backoffReason,
    adaptiveEnabled: note.adaptiveEnabled,
  }
}
