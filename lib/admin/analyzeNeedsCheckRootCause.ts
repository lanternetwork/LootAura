import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { isArchivedTerminalAddressStatus } from '@/lib/ingestion/address/terminalAddressDisposition'
import {
  classifyNeedsCheckBlocker,
  collectFailureSignals,
  publishabilityProfileForCategory,
  type NeedsCheckClassificationInput,
} from '@/lib/admin/classifyNeedsCheckBlocker'
import {
  NEEDS_CHECK_AGE_BUCKETS,
  NEEDS_CHECK_BLOCKER_CATEGORIES,
  type NeedsCheckAgeBucket,
  type NeedsCheckBlockerCategory,
  type NeedsCheckRootCauseAnalysis,
} from '@/lib/admin/needsCheckRootCauseTypes'

const UNKNOWN = '(null)'
const MS_PER_DAY = 24 * 60 * 60 * 1000

function bucketKey(value: string | null | undefined): string {
  if (value == null || value === '') return UNKNOWN
  return value
}

function ageBucketForUpdatedAt(updatedAt: string | null, nowMs: number): NeedsCheckAgeBucket {
  if (!updatedAt) return 'over_30d'
  const ageMs = nowMs - new Date(updatedAt).getTime()
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'under_7d'
  const ageDays = ageMs / MS_PER_DAY
  if (ageDays < 7) return 'under_7d'
  if (ageDays <= 30) return '7_to_30d'
  return 'over_30d'
}

function emptyCategoryCounts(): Record<NeedsCheckBlockerCategory, number> {
  return Object.fromEntries(
    NEEDS_CHECK_BLOCKER_CATEGORIES.map((category) => [category, 0])
  ) as Record<NeedsCheckBlockerCategory, number>
}

function emptyAgeBuckets(): Record<NeedsCheckAgeBucket, number> {
  return Object.fromEntries(NEEDS_CHECK_AGE_BUCKETS.map((bucket) => [bucket, 0])) as Record<
    NeedsCheckAgeBucket,
    number
  >
}

type NeedsCheckDbRow = {
  address_status: string | null
  coordinate_precision: string | null
  failure_details: unknown
  failure_reasons: unknown
  lat: number | null
  lng: number | null
  normalized_address: string | null
  city: string | null
  state: string | null
  date_start: string | null
  date_end: string | null
  updated_at: string | null
}

function toClassificationInput(row: NeedsCheckDbRow, nowMs: number): NeedsCheckClassificationInput {
  return {
    addressStatus: row.address_status,
    coordinatePrecision: row.coordinate_precision,
    failureDetails: row.failure_details,
    failureReasons: row.failure_reasons,
    lat: row.lat,
    lng: row.lng,
    normalizedAddress: row.normalized_address,
    city: row.city,
    state: row.state,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    nowMs,
  }
}

/**
 * Workstream A2 — read-only scan of all `needs_check` rows for discovery classification.
 */
export async function analyzeNeedsCheckRootCause(now: Date = new Date()): Promise<NeedsCheckRootCauseAnalysis> {
  const admin = getAdminDb()
  const nowMs = now.getTime()
  const pageSize = 1000
  let from = 0

  const byBlockerCategory = emptyCategoryCounts()
  const byAgeBucket = emptyAgeBuckets()
  const byPublishability: Record<string, number> = {}
  const failureSignals: Record<string, number> = {}
  const pairCounts = new Map<string, { addressStatus: string; coordinatePrecision: string; count: number }>()
  let scanned = 0
  let terminalArchived = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select(
        'address_status, coordinate_precision, failure_details, failure_reasons, lat, lng, normalized_address, city, state, date_start, date_end, updated_at'
      )
      .eq('status', 'needs_check')
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const chunk = (Array.isArray(data) ? data : []) as NeedsCheckDbRow[]

    for (const row of chunk) {
      scanned += 1
      if (isArchivedTerminalAddressStatus(row.address_status)) {
        terminalArchived += 1
        continue
      }
      const input = toClassificationInput(row, nowMs)
      const category = classifyNeedsCheckBlocker(input)
      byBlockerCategory[category] += 1

      const ageBucket = ageBucketForUpdatedAt(row.updated_at, nowMs)
      byAgeBucket[ageBucket] += 1

      const publishProfile = publishabilityProfileForCategory(category)
      byPublishability[publishProfile] = (byPublishability[publishProfile] ?? 0) + 1

      for (const signal of collectFailureSignals(input)) {
        failureSignals[signal] = (failureSignals[signal] ?? 0) + 1
      }

      const addressStatus = bucketKey(row.address_status)
      const coordinatePrecision = bucketKey(row.coordinate_precision)
      const pairKey = `${addressStatus}\0${coordinatePrecision}`
      const existing = pairCounts.get(pairKey)
      if (existing) {
        existing.count += 1
      } else {
        pairCounts.set(pairKey, { addressStatus, coordinatePrecision, count: 1 })
      }
    }

    if (chunk.length < pageSize) {
      break
    }
    from += pageSize
  }

  const total = scanned - terminalArchived
  const allPairs = [...pairCounts.values()]
    .sort((a, b) => b.count - a.count)
    .map((pair) => ({
      addressStatus: pair.addressStatus,
      coordinatePrecision: pair.coordinatePrecision,
      count: pair.count,
      pct: total > 0 ? pair.count / total : 0,
    }))

  return {
    total,
    scanned,
    byBlockerCategory,
    byAgeBucket,
    byPublishability,
    failureSignals,
    allPairs,
  }
}
