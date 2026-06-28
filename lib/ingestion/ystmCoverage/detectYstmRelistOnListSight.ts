import { classifyYstmListMetadataAsValidActive } from '@/lib/ingestion/ystmCoverage/classifyYstmListMetadataAsValidActive'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import { coerceIngestedDateToYyyyMmDd } from '@/lib/ingestion/saleWindowDates'

export type YstmObservationRelistState = {
  ystmInvalidReason: string | null
  lastDetailCheckedAt: string | null
  listMetadataSnapshot: YstmListMetadataSale | null
  relistPreviousStartDate?: string | null
  relistPreviousEndDate?: string | null
  relistCurrentStartDate?: string | null
  relistCurrentEndDate?: string | null
}

export type YstmRelistDetectionResult = {
  /** Prior observation was detail-validated as expired. */
  isExpiredObservation: boolean
  /** Event-defining list metadata changed since last stored snapshot. */
  eventFieldsChanged: string[]
  needsDetailRefresh: boolean
  preserveDetailCheckedAt: string | null
  previousStartDate: string | null
  previousEndDate: string | null
  currentStartDate: string | null
  currentEndDate: string | null
  relistReason: string | null
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

function normalizeDate(value: string | null | undefined): string | null {
  return coerceIngestedDateToYyyyMmDd(value ?? null)
}

function firstThumbnailUrl(sale: YstmListMetadataSale): string | null {
  const first = sale.imageUrls[0]?.trim()
  return first ? first.toLowerCase() : null
}

/** Compare event-defining fields between prior and incoming list metadata. */
export function compareYstmRelistEventFields(
  previous: YstmListMetadataSale | null,
  incoming: YstmListMetadataSale
): string[] {
  if (!previous) return []

  const changed: string[] = []
  if (normalizeDate(previous.startDate) !== normalizeDate(incoming.startDate)) {
    changed.push('start_date')
  }
  if (normalizeDate(previous.endDate) !== normalizeDate(incoming.endDate)) {
    changed.push('end_date')
  }
  if (normalizeText(previous.title) !== normalizeText(incoming.title)) {
    changed.push('title')
  }
  if (firstThumbnailUrl(previous) !== firstThumbnailUrl(incoming)) {
    changed.push('thumbnail')
  }
  if (normalizeText(previous.address) !== normalizeText(incoming.address)) {
    changed.push('address')
  }
  return changed
}

function readPreviousDates(existing: YstmObservationRelistState): {
  start: string | null
  end: string | null
} {
  const snapshot = existing.listMetadataSnapshot
  return {
    start:
      normalizeDate(snapshot?.startDate) ??
      normalizeDate(existing.relistPreviousStartDate) ??
      normalizeDate(existing.relistCurrentStartDate),
    end:
      normalizeDate(snapshot?.endDate) ??
      normalizeDate(existing.relistPreviousEndDate) ??
      normalizeDate(existing.relistCurrentEndDate),
  }
}

function inferChangedWithoutSnapshot(
  existing: YstmObservationRelistState,
  incoming: YstmListMetadataSale
): string[] {
  const previousDates = readPreviousDates(existing)
  const incomingStart = normalizeDate(incoming.startDate)
  const incomingEnd = normalizeDate(incoming.endDate)

  if (
    previousDates.start &&
    incomingStart &&
    previousDates.start !== incomingStart
  ) {
    return ['start_date']
  }
  if (previousDates.end && incomingEnd && previousDates.end !== incomingEnd) {
    return ['end_date']
  }

  const incomingLooksActive = classifyYstmListMetadataAsValidActive(incoming).valid
  if (incomingLooksActive) {
    return ['list_metadata_active']
  }
  return []
}

/**
 * Detect whether an expired observation should schedule detail refresh after list re-sight.
 * Does not mutate publishing/validation — list metadata alone never flips expired → active.
 */
export function detectYstmRelistOnListSight(input: {
  existing: YstmObservationRelistState | null
  incoming: YstmListMetadataSale
}): YstmRelistDetectionResult {
  const currentStartDate = normalizeDate(input.incoming.startDate)
  const currentEndDate = normalizeDate(input.incoming.endDate)

  if (input.existing?.ystmInvalidReason !== 'expired') {
    return {
      isExpiredObservation: false,
      eventFieldsChanged: [],
      needsDetailRefresh: false,
      preserveDetailCheckedAt: null,
      previousStartDate: null,
      previousEndDate: null,
      currentStartDate,
      currentEndDate,
      relistReason: null,
    }
  }

  const previousDates = readPreviousDates(input.existing)
  const eventFieldsChanged = input.existing.listMetadataSnapshot
    ? compareYstmRelistEventFields(input.existing.listMetadataSnapshot, input.incoming)
    : inferChangedWithoutSnapshot(input.existing, input.incoming)

  const needsDetailRefresh = eventFieldsChanged.length > 0

  return {
    isExpiredObservation: true,
    eventFieldsChanged,
    needsDetailRefresh,
    preserveDetailCheckedAt: input.existing.lastDetailCheckedAt,
    previousStartDate: previousDates.start,
    previousEndDate: previousDates.end,
    currentStartDate,
    currentEndDate,
    relistReason: needsDetailRefresh ? eventFieldsChanged.join(',') : null,
  }
}
