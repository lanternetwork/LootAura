export type YstmCoverageOperationalAlertLevel = 'warning' | 'critical'

export type YstmCoverageOperationalAlert = {
  level: YstmCoverageOperationalAlertLevel
  code: string
  message: string
}

export type YstmCoverageOperationalHealth = {
  healthy: boolean
  alerts: YstmCoverageOperationalAlert[]
}

export type YstmCoveragePipelineBacklog = {
  missingValidUrls: number
  missingIngestionQueue: number
  missingIngestionNeverAttempted: number
  catalogRepairQueue: number
  existingRefreshStale: number
}

export type YstmCoverageOperationalHealthInput = {
  targetPct: number
  coveragePct: number | null
  validActiveYstmUrls: number
  missingValidYstmUrls: number
  lastAuditAt: string | null
  trend: Array<{ coveragePct: number | null }>
  missingIngestionQueue: number
  missingIngestionNeverAttempted: number
  catalogRepairQueue: number
  existingRefreshStale: number
  configsWithoutSourcePages: number
  crawlableConfigs: number
  nowMs?: number
}

/** Minimum valid-active URLs in audit footprint before coverage SLO alerts fire. */
export const YSTM_COVERAGE_SLO_MIN_VALID_URLS = 25

/** Completed audit older than this is considered stale for SLO purposes. */
export const YSTM_COVERAGE_AUDIT_STALE_HOURS = 48

/** Point drop between last two audits that triggers a declining-coverage warning. */
export const YSTM_COVERAGE_TREND_DECLINE_PP = 5

/** Share of valid-active URLs still missing on LootAura that triggers backlog warning. */
export const YSTM_COVERAGE_MISSING_QUEUE_WARNING_RATE = 0.2

const MS_PER_HOUR = 60 * 60 * 1000

export function buildYstmCoveragePipelineBacklog(input: {
  missingValidYstmUrls: number
  missingIngestion: {
    missingQueueTotal: number
    missingIngestionNeverAttempted: number
  }
  catalogRepair: { repairQueueTotal: number }
  existingRefresh: { staleOver12h: number }
}): YstmCoveragePipelineBacklog {
  return {
    missingValidUrls: input.missingValidYstmUrls,
    missingIngestionQueue: input.missingIngestion.missingQueueTotal,
    missingIngestionNeverAttempted: input.missingIngestion.missingIngestionNeverAttempted,
    catalogRepairQueue: input.catalogRepair.repairQueueTotal,
    existingRefreshStale: input.existingRefresh.staleOver12h,
  }
}

export function evaluateYstmCoverageOperationalHealth(
  input: YstmCoverageOperationalHealthInput
): YstmCoverageOperationalHealth {
  const alerts: YstmCoverageOperationalAlert[] = []
  const nowMs = input.nowMs ?? Date.now()
  const targetPct = input.targetPct
  const valid = input.validActiveYstmUrls

  if (valid < YSTM_COVERAGE_SLO_MIN_VALID_URLS) {
    if (valid > 0) {
      alerts.push({
        level: 'warning',
        code: 'coverage_denominator_sparse',
        message: `Audit footprint has only ${valid} valid active YSTM URLs (need ≥${YSTM_COVERAGE_SLO_MIN_VALID_URLS} before coverage SLO is actionable).`,
      })
    } else {
      alerts.push({
        level: 'warning',
        code: 'coverage_no_audit_denominator',
        message:
          'No valid active YSTM URLs in the coverage audit footprint yet — run the coverage audit cron or expand source pages.',
      })
    }
    return { healthy: alerts.every((a) => a.level !== 'critical'), alerts }
  }

  const lastAuditMs = input.lastAuditAt ? Date.parse(input.lastAuditAt) : NaN
  if (!Number.isFinite(lastAuditMs)) {
    alerts.push({
      level: 'warning',
      code: 'coverage_audit_never_completed',
      message: 'No completed YSTM coverage audit run on record.',
    })
  } else if (nowMs - lastAuditMs > YSTM_COVERAGE_AUDIT_STALE_HOURS * MS_PER_HOUR) {
    const hoursAgo = Math.round((nowMs - lastAuditMs) / MS_PER_HOUR)
    alerts.push({
      level: 'warning',
      code: 'coverage_audit_stale',
      message: `Last completed coverage audit was ${hoursAgo}h ago (stale after ${YSTM_COVERAGE_AUDIT_STALE_HOURS}h).`,
    })
  }

  if (input.coveragePct != null && input.coveragePct < targetPct) {
    alerts.push({
      level: 'critical',
      code: 'coverage_below_target',
      message: `Coverage ${input.coveragePct.toFixed(1)}% is below ${targetPct}% target (${input.missingValidYstmUrls} valid YSTM URLs still missing on LootAura).`,
    })
  }

  const trendPoints = input.trend.filter((p) => p.coveragePct != null)
  if (trendPoints.length >= 2) {
    const prev = trendPoints[trendPoints.length - 2]!.coveragePct!
    const latest = trendPoints[trendPoints.length - 1]!.coveragePct!
    const delta = latest - prev
    if (delta <= -YSTM_COVERAGE_TREND_DECLINE_PP) {
      alerts.push({
        level: 'warning',
        code: 'coverage_trend_declining',
        message: `Coverage fell ${Math.abs(delta).toFixed(1)} pp between the last two completed audits (${prev.toFixed(1)}% → ${latest.toFixed(1)}%).`,
      })
    }
  }

  const missingRate = valid > 0 ? input.missingValidYstmUrls / valid : 0
  if (missingRate >= YSTM_COVERAGE_MISSING_QUEUE_WARNING_RATE) {
    alerts.push({
      level: 'warning',
      code: 'coverage_missing_queue_elevated',
      message: `${input.missingValidYstmUrls} valid YSTM URLs (${(missingRate * 100).toFixed(1)}%) are still missing from LootAura in the audit footprint.`,
    })
  }

  if (input.missingIngestionNeverAttempted >= 50) {
    alerts.push({
      level: 'warning',
      code: 'coverage_missing_ingestion_backlog',
      message: `${input.missingIngestionNeverAttempted} missing URLs have never been attempted by the missing-ingestion cron.`,
    })
  }

  if (input.catalogRepairQueue >= 75) {
    alerts.push({
      level: 'warning',
      code: 'coverage_catalog_repair_backlog',
      message: `${input.catalogRepairQueue} YSTM ingested rows are queued for catalog repair (needs_check / publish_failed / geocode gaps).`,
    })
  }

  if (input.existingRefreshStale >= 150) {
    alerts.push({
      level: 'warning',
      code: 'coverage_existing_refresh_stale',
      message: `${input.existingRefreshStale} known YSTM ingested rows are stale (>12h since last source sync).`,
    })
  }

  if (input.configsWithoutSourcePages >= 100) {
    alerts.push({
      level: 'warning',
      code: 'coverage_source_expansion_gap',
      message: `${input.configsWithoutSourcePages} city configs still lack source_pages — nationwide footprint is incomplete.`,
    })
  }

  return {
    healthy: alerts.length === 0,
    alerts,
  }
}
