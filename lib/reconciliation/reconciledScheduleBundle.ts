import { extractAuthoritativeSaleHourRangeFromText } from '@/lib/ingestion/saleHourRangeFromText'
import type { ParsedListingSnapshotForReconciliation } from '@/lib/reconciliation/reconciliationParseSnapshot'
import type { IngestFingerprint } from '@/lib/reconciliation/types'
import {
  RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH,
  computeCanonicalReconciliationScheduleHash,
  computeContentHash,
  computeImageHash,
} from '@/lib/reconciliation/sourceHashing'

export { RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH }

export type ScheduleBundleProvenance =
  | 'parsed_snapshot'
  | 'prose_window'
  | 'existing_ingest'
  | 'existing_sale'
  | 'mixed_safe'

export type ReconciledScheduleBundleOk = {
  readonly ok: true
  readonly dateStart: string
  readonly dateEnd: string
  readonly timeStart: string
  readonly timeEnd: string
  readonly listingTimezone: string | null
  readonly provenance: ScheduleBundleProvenance
  /** Machine token only — no PII */
  readonly schedule_bundle_reason: string
}

export type ReconciledScheduleBundleFail = {
  readonly ok: false
  readonly reasons: readonly string[]
  readonly schedule_bundle_reason: string
}

export type ReconciledScheduleBundleResult = ReconciledScheduleBundleOk | ReconciledScheduleBundleFail

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function normalizeTextOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const out = value.trim()
  return out.length > 0 ? out : null
}

function isValidYmd(value: string | null | undefined): boolean {
  const s = normalizeTextOrNull(value)
  return Boolean(s && YMD_RE.test(s))
}

function listingTimezoneFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const z = (raw as { listing_timezone?: unknown }).listing_timezone
  return typeof z === 'string' && z.trim() ? z.trim() : null
}

// ---------------------------------------------------------------------------
// Prose window inference (canonical with Phase 2A safe sync)
// ---------------------------------------------------------------------------

export function inferOpeningTimeStartFromDescription(description: string | null | undefined): string | null {
  const t = normalizeTextOrNull(description)
  if (!t) return null
  return extractAuthoritativeSaleHourRangeFromText(t)?.timeStart ?? null
}

export function inferClosingTimeEndFromDescription(description: string | null | undefined): string | null {
  const t = normalizeTextOrNull(description)
  if (!t) return null
  return extractAuthoritativeSaleHourRangeFromText(t)?.timeEnd ?? null
}

export type BuildReconciledScheduleBundleInput = {
  /**
   * Description text used for prose window detection (refreshed HTML when `parsed` set,
   * otherwise the persisted ingest description for baseline fingerprints).
   */
  readonly refreshedDescription: string | null | undefined
  readonly parsed: ParsedListingSnapshotForReconciliation | null
  readonly ingest: {
    readonly date_start: string | null
    readonly date_end: string | null
    readonly time_start: string | null
    readonly time_end: string | null
    readonly raw_payload: unknown
  }
  readonly sale: {
    readonly date_start: string | null
    readonly date_end: string | null
    readonly time_start: string | null
    readonly time_end: string | null
  } | null
  readonly lat: number | null
  readonly lng: number | null
}

function hasParsedStructuredTimes(parsed: ParsedListingSnapshotForReconciliation | null): parsed is ParsedListingSnapshotForReconciliation & {
  timeStart: string
  timeEnd: string
} {
  if (!parsed) return false
  const p = parsed as ParsedListingSnapshotForReconciliation & {
    timeStart?: string | null
    timeEnd?: string | null
  }
  const a = normalizeTextOrNull(p.timeStart ?? null)
  const b = normalizeTextOrNull(p.timeEnd ?? null)
  return Boolean(a && b)
}

/**
 * Single canonical schedule bundle for reconciliation fingerprints and Phase 2A safe sync.
 * Precedence: parsed structured times → prose window on refreshed description → ingest → sale.
 */
export function buildReconciledScheduleBundle(input: BuildReconciledScheduleBundleInput): ReconciledScheduleBundleResult {
  const lat = Number(input.lat ?? NaN)
  const lng = Number(input.lng ?? NaN)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      reasons: ['missing_coordinates'],
      schedule_bundle_reason: 'missing_coordinates',
    }
  }

  const dateStartRaw = normalizeTextOrNull(input.parsed?.dateStart ?? input.ingest.date_start)
  const dateEndRaw = normalizeTextOrNull(input.parsed?.dateEnd ?? input.ingest.date_end) ?? dateStartRaw

  if (!isValidYmd(dateStartRaw)) {
    return {
      ok: false,
      reasons: ['invalid_date_start'],
      schedule_bundle_reason: 'invalid_schedule_dates',
    }
  }
  const dateStart = dateStartRaw!
  if (!isValidYmd(dateEndRaw)) {
    return {
      ok: false,
      reasons: ['invalid_date_end'],
      schedule_bundle_reason: 'invalid_schedule_dates',
    }
  }
  const dateEnd = dateEndRaw!

  const listingTimezone = listingTimezoneFromRaw(input.ingest.raw_payload)

  const proseStart = inferOpeningTimeStartFromDescription(input.refreshedDescription)
  const proseEnd = inferClosingTimeEndFromDescription(input.refreshedDescription)
  const proseFull = Boolean(proseStart && proseEnd)

  if (input.parsed && hasParsedStructuredTimes(input.parsed)) {
    const ts = normalizeTextOrNull((input.parsed as { timeStart: string }).timeStart)!
    const te = normalizeTextOrNull((input.parsed as { timeEnd: string }).timeEnd)!
    return {
      ok: true,
      dateStart,
      dateEnd,
      timeStart: ts,
      timeEnd: te,
      listingTimezone,
      provenance: 'parsed_snapshot',
      schedule_bundle_reason: 'parsed_structured_times',
    }
  }

  if (proseFull && proseStart && proseEnd) {
    const provenance: ScheduleBundleProvenance =
      normalizeTextOrNull(input.parsed?.dateStart) || normalizeTextOrNull(input.parsed?.dateEnd)
        ? 'mixed_safe'
        : 'prose_window'
    return {
      ok: true,
      dateStart,
      dateEnd,
      timeStart: proseStart,
      timeEnd: proseEnd,
      listingTimezone,
      provenance,
      schedule_bundle_reason: 'prose_time_window',
    }
  }

  const ingestTs = normalizeTextOrNull(input.ingest.time_start)
  const ingestTe = normalizeTextOrNull(input.ingest.time_end)
  if (ingestTs && ingestTe) {
    return {
      ok: true,
      dateStart,
      dateEnd,
      timeStart: ingestTs,
      timeEnd: ingestTe,
      listingTimezone,
      provenance: 'existing_ingest',
      schedule_bundle_reason: 'ingest_structured_times',
    }
  }

  const saleTs = input.sale ? normalizeTextOrNull(input.sale.time_start) : null
  const saleTe = input.sale ? normalizeTextOrNull(input.sale.time_end) : null
  if (saleTs && saleTe) {
    return {
      ok: true,
      dateStart,
      dateEnd,
      timeStart: saleTs,
      timeEnd: saleTe,
      listingTimezone,
      provenance: 'existing_sale',
      schedule_bundle_reason: 'sale_fallback_times',
    }
  }

  return {
    ok: false,
    reasons: ['no_complete_schedule_signal'],
    schedule_bundle_reason: 'no_complete_schedule_signal',
  }
}

export type BuildReconciliationIngestFingerprintInput = {
  readonly title: string | null | undefined
  readonly description: string | null | undefined
  readonly imageUrls: readonly string[]
  readonly ingest: BuildReconciledScheduleBundleInput['ingest']
  readonly parsed: ParsedListingSnapshotForReconciliation | null
  readonly sale: BuildReconciledScheduleBundleInput['sale']
  readonly refreshedDescription: string | null | undefined
  readonly priorScheduleHashForFallback: string
  readonly lat: number | null
  readonly lng: number | null
}

/**
 * Fingerprint + bundle for reconciliation: schedule hash matches canonical bundle (no description aux drift).
 * When the bundle cannot be formed for fingerprinting, reuses `priorScheduleHashForFallback` for scheduleHash.
 */
export function buildReconciliationIngestFingerprint(
  input: BuildReconciliationIngestFingerprintInput
): { readonly fingerprint: IngestFingerprint; readonly bundle: ReconciledScheduleBundleResult } {
  const bundle = buildReconciledScheduleBundle({
    refreshedDescription: input.refreshedDescription,
    parsed: input.parsed,
    ingest: input.ingest,
    sale: input.sale,
    lat: input.lat,
    lng: input.lng,
  })

  const scheduleHash = bundle.ok
    ? computeCanonicalReconciliationScheduleHash({
        dateStart: bundle.dateStart,
        dateEnd: bundle.dateEnd,
        timeStart: bundle.timeStart,
        timeEnd: bundle.timeEnd,
        listingTimezone: bundle.listingTimezone,
      })
    : (input.priorScheduleHashForFallback ?? RECONCILIATION_FAILED_BUNDLE_SCHEDULE_HASH)

  return {
    fingerprint: {
      contentHash: computeContentHash(input.title, input.description),
      scheduleHash,
      imageHash: computeImageHash(input.imageUrls),
    },
    bundle,
  }
}
