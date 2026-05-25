import type { ProcessedIngestedSale } from '@/lib/ingestion/types'
import {
  evaluateSoftDuplicateAgainstCandidates,
  normalizeTitleForDedupe,
  SOFT_CANDIDATE_FETCH_DAY_RADIUS,
  type DuplicateListingConfidence,
  type DuplicateScoringIncoming,
  type SoftDuplicateCandidateRow,
  type SoftDuplicateEvaluation,
} from '@/lib/ingestion/duplicateScoring'
import { computeYstmSaleInstanceIdentity } from '@/lib/ingestion/identity/computeYstmSaleInstanceIdentity'
import { findPrimaryIngestedSaleBySourceUrl } from '@/lib/ingestion/identity/ingestedSaleSourceUrlLookup'
import { maybeRecordCrossProviderShadowOnExternalIngest } from '@/lib/ingestion/identity/maybeRecordCrossProviderShadowOnExternalIngest'
import {
  recordIngestedSaleSoftDedupeSuppression,
  suppressionReasonFromEvaluation,
} from '@/lib/ingestion/identity/recordSoftDedupeSuppression'
import {
  evaluateSoftDedupeSuppressionSafety,
  type SoftDedupeSafetyIncoming,
} from '@/lib/ingestion/identity/softDedupeSafety'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

/**
 * Ingested-sales duplicate decision flow (manual upload + shared helpers):
 *
 * 1) `source_url` exact hit → update same row (exact_duplicate, never duplicate-suppress flag).
 * 2) Else `normalized_address` + `date_start` exact hit → update same row (exact_duplicate).
 * 3) Else same `normalized_address`, `date_start` within ±3d fetch window → deterministic soft scoring
 *    (`duplicateScoring.ts`): pick max score, tie-break by smallest row `id`. If score clears adaptive
 *    thresholds → soft duplicate (suppress). If best score fails thresholds → **no match** (insert new;
 *    weak_match telemetry). Previously step (3) used ±1d only and `.find()` on unordered rows (nondeterministic).
 * 4) `persistExternalPageSource` additionally skips insert when (3) would suppress for same address window
 *    but `source_url` is new (extension vs crawler overlap).
 *
 * Known remaining gaps: no cross-address “same lat/lng” dedupe; no normalized canonical URL dedupe for
 * tracking-parameter variants; DB collision path remains best-effort.
 */

export interface IngestedSaleMatch {
  id: string
  matchType: 'source_url' | 'address_date' | 'soft_address_date'
  duplicateConfidence: DuplicateListingConfidence
  /**
   * When false for `soft_address_date`, the caller should treat the row as a new listing
   * (weak / scored reject). `source_url` / `address_date` matches are never duplicate-suppressed.
   */
  suppressAsDuplicate: boolean
}

type DedupeDecisionMatchType = 'source_url' | 'exact_address_date' | 'soft_date_window' | 'none'
type DateDeltaBucket = 'not_applicable' | 'same_day' | 'minus_1_day' | 'plus_1_day'

export type DedupeTelemetryContext = {
  sourcePlatform?: string
  normalizedTitle?: string | null
  externalId?: string | null
  imageSourceUrl?: string | null
}

export type DedupeDecisionAggregate = {
  source_url: number
  exact_address_date: number
  soft_date_window: number
  soft_duplicate_rejected: number
  no_match: number
  duplicateDecisionTrue: number
  duplicateDecisionFalse: number
}

export function createEmptyDedupeDecisionAggregate(): DedupeDecisionAggregate {
  return {
    source_url: 0,
    exact_address_date: 0,
    soft_date_window: 0,
    soft_duplicate_rejected: 0,
    no_match: 0,
    duplicateDecisionTrue: 0,
    duplicateDecisionFalse: 0,
  }
}

export function accumulateDedupeDecisionAggregate(
  aggregate: DedupeDecisionAggregate,
  match: IngestedSaleMatch | null,
  meta?: { softScoringRejected?: boolean }
): DedupeDecisionAggregate {
  if (meta?.softScoringRejected) {
    aggregate.soft_duplicate_rejected += 1
    aggregate.duplicateDecisionFalse += 1
    return aggregate
  }
  if (match?.matchType === 'source_url') {
    aggregate.source_url += 1
    aggregate.duplicateDecisionFalse += 1
    return aggregate
  }
  if (match?.matchType === 'address_date') {
    aggregate.exact_address_date += 1
    aggregate.duplicateDecisionFalse += 1
    return aggregate
  }
  if (match?.matchType === 'soft_address_date') {
    if (match.suppressAsDuplicate) {
      aggregate.soft_date_window += 1
      aggregate.duplicateDecisionTrue += 1
    } else {
      aggregate.duplicateDecisionFalse += 1
    }
    return aggregate
  }
  aggregate.no_match += 1
  aggregate.duplicateDecisionFalse += 1
  return aggregate
}

function dateDeltaBucketFromDays(deltaDays: number): DateDeltaBucket {
  if (deltaDays === 0) return 'same_day'
  if (deltaDays === -1) return 'minus_1_day'
  if (deltaDays === 1) return 'plus_1_day'
  return 'not_applicable'
}

function scoreBucketFromScore(score: number | null): 'none' | '0_49' | '50_69' | '70_89' | '90_plus' {
  if (score == null) return 'none'
  if (score < 50) return '0_49'
  if (score < 70) return '50_69'
  if (score < 90) return '70_89'
  return '90_plus'
}

function emitDedupeDecision(params: {
  processed: ProcessedIngestedSale
  matchType: DedupeDecisionMatchType
  duplicateDecision: boolean
  candidateCount: number
  dateDeltaBucket: DateDeltaBucket
  sourcePlatform?: string
  duplicateConfidence?: DuplicateListingConfidence
  scoreBucket?: ReturnType<typeof scoreBucketFromScore>
  tieBreakId?: string | null
}) {
  logger.info('Ingested sale dedupe decision', {
    component: 'ingestion/dedupe',
    operation: 'match_decision',
    matchType: params.matchType,
    duplicateDecision: params.duplicateDecision,
    candidateCount: params.candidateCount,
    dateDeltaBucket: params.dateDeltaBucket,
    hasCity: Boolean(params.processed.city),
    hasState: Boolean(params.processed.state),
    hasNormalizedAddress: Boolean(params.processed.normalizedAddress),
    sourcePlatform: params.sourcePlatform || 'unknown',
    duplicateConfidence: params.duplicateConfidence ?? 'distinct_listing',
    scoreBucket: params.scoreBucket ?? 'none',
    tieBreakId: params.tieBreakId ?? null,
  })

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.ingestion.duplicateScoringDecision, {
      matchType: params.matchType,
      duplicateDecision: params.duplicateDecision,
      candidateCount: params.candidateCount,
      dateDeltaBucket: params.dateDeltaBucket,
      duplicateConfidence: params.duplicateConfidence ?? 'distinct_listing',
      scoreBucket: params.scoreBucket ?? 'none',
      tieBreakId: params.tieBreakId ?? null,
      sourcePlatform: params.sourcePlatform || 'unknown',
    })
  )
}

function buildIncomingForScoring(
  _sourceUrl: string,
  processed: ProcessedIngestedSale,
  context?: DedupeTelemetryContext
): DuplicateScoringIncoming {
  return {
    normalizedAddress: processed.normalizedAddress,
    dateStart: processed.dateStart,
    dateEnd: processed.dateEnd,
    normalizedTitle: normalizeTitleForDedupe(context?.normalizedTitle ?? null),
    sourcePlatform: context?.sourcePlatform ?? null,
    externalId: context?.externalId?.trim() || null,
    imageSourceUrl: context?.imageSourceUrl ?? null,
    lat: processed.lat,
    lng: processed.lng,
  }
}

function softFetchDateBounds(centerIso: string): { min: string; max: string } {
  const dt = new Date(`${centerIso}T00:00:00.000Z`)
  const min = new Date(dt)
  min.setUTCDate(min.getUTCDate() - SOFT_CANDIDATE_FETCH_DAY_RADIUS)
  const max = new Date(dt)
  max.setUTCDate(max.getUTCDate() + SOFT_CANDIDATE_FETCH_DAY_RADIUS)
  return { min: min.toISOString().slice(0, 10), max: max.toISOString().slice(0, 10) }
}

async function fetchSoftAddressCandidates(
  admin: ReturnType<typeof getAdminDb>,
  normalizedAddress: string,
  dateStart: string
): Promise<SoftDuplicateCandidateRow[]> {
  const { min, max } = softFetchDateBounds(dateStart)
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select(
      'id, date_start, date_end, title, source_platform, external_id, lat, lng, image_source_url, source_url, canonical_source_url, sale_instance_key, source_listing_id, source_location_hash, status, failure_reasons'
    )
    .eq('normalized_address', normalizedAddress)
    .not('date_start', 'is', null)
    .gte('date_start', min)
    .lte('date_start', max)
    .order('id', { ascending: true })
    .limit(100)
  if (error) {
    logger.warn('Ingested sale dedupe: soft candidate query failed', {
      component: 'ingestion/dedupe',
      operation: 'soft_candidate_query',
      message: error.message,
    })
    return []
  }
  return (data ?? []) as SoftDuplicateCandidateRow[]
}

export type ExternalListDuplicateProbe = {
  title: string
  city: string
  state: string
  addressRaw: string | null
  startDate: string | null
  endDate?: string | null
  externalId: string | null
  imageSourceUrl: string | null
  sourceUrl: string
  lat?: number | null
  lng?: number | null
}

function buildSoftDedupeSafetyIncoming(
  platform: string,
  probe: ExternalListDuplicateProbe,
  normalizedAddress: string
): SoftDedupeSafetyIncoming {
  const identity = computeYstmSaleInstanceIdentity({
    sourcePlatform: platform,
    sourceUrl: probe.sourceUrl,
    state: probe.state,
    city: probe.city,
    normalizedAddress,
    dateStart: probe.startDate,
    dateEnd: probe.endDate ?? null,
    title: probe.title,
    description: null,
    imageSourceUrl: probe.imageSourceUrl,
    lat: probe.lat ?? null,
    lng: probe.lng ?? null,
    rawPayload: null,
  })
  return {
    dateStart: probe.startDate,
    dateEnd: probe.endDate ?? null,
    sourceUrl: probe.sourceUrl,
    externalId: probe.externalId,
    state: probe.state,
    city: probe.city,
    normalizedAddress,
    lat: probe.lat ?? null,
    lng: probe.lng ?? null,
    saleInstanceKey: identity?.sale_instance_key ?? null,
    sourceLocationHash: identity?.source_location_hash ?? null,
  }
}

function buildSoftDedupeSafetyIncomingFromProcessed(
  sourceUrl: string,
  processed: ProcessedIngestedSale,
  context?: DedupeTelemetryContext
): SoftDedupeSafetyIncoming {
  const identity = computeYstmSaleInstanceIdentity({
    sourcePlatform: context?.sourcePlatform ?? 'unknown',
    sourceUrl,
    state: processed.state,
    city: processed.city,
    normalizedAddress: processed.normalizedAddress,
    dateStart: processed.dateStart,
    dateEnd: processed.dateEnd,
    title: context?.normalizedTitle ?? null,
    description: null,
    imageSourceUrl: context?.imageSourceUrl ?? null,
    lat: processed.lat,
    lng: processed.lng,
    rawPayload: null,
  })
  return {
    dateStart: processed.dateStart,
    dateEnd: processed.dateEnd,
    sourceUrl,
    externalId: context?.externalId?.trim() || null,
    state: processed.state,
    city: processed.city,
    normalizedAddress: processed.normalizedAddress,
    lat: processed.lat,
    lng: processed.lng,
    saleInstanceKey: identity?.sale_instance_key ?? null,
    sourceLocationHash: identity?.source_location_hash ?? null,
  }
}

/**
 * External list ingestion: deterministic duplicate skip before insert when the listing URL is new
 * but the same normalized address + scored duplicate signals match an existing ingested row.
 */
export type ExternalListDuplicateSkipResult = {
  skip: boolean
  duplicateOfId: string | null
  evaluation: SoftDuplicateEvaluation | null
  /** Set when `skip` is true from soft scoring (URL-level skips classified in adapter). */
  skipKind: 'duplicate_cross_city_page' | null
}

export async function evaluateDuplicateSkipForExternalListListing(
  admin: ReturnType<typeof getAdminDb>,
  platform: string,
  probe: ExternalListDuplicateProbe
): Promise<ExternalListDuplicateSkipResult> {
  const normalizedAddress = probe.addressRaw
    ? probe.addressRaw.toLowerCase().replace(/\s+/g, ' ').trim()
    : null
  if (!normalizedAddress || !probe.startDate) {
    return { skip: false, duplicateOfId: null, evaluation: null, skipKind: null }
  }

  const incoming: DuplicateScoringIncoming = {
    normalizedAddress,
    dateStart: probe.startDate,
    dateEnd: probe.endDate ?? null,
    normalizedTitle: normalizeTitleForDedupe(probe.title),
    sourcePlatform: platform,
    externalId: probe.externalId?.trim() || null,
    imageSourceUrl: probe.imageSourceUrl,
    lat: probe.lat ?? null,
    lng: probe.lng ?? null,
  }

  const rows = await fetchSoftAddressCandidates(admin, normalizedAddress, probe.startDate)
  const evaluation = evaluateSoftDuplicateAgainstCandidates(incoming, rows)
  if (evaluation.suppress && evaluation.winner) {
    const safetyIncoming = buildSoftDedupeSafetyIncoming(platform, probe, normalizedAddress)
    const safety = evaluateSoftDedupeSuppressionSafety(safetyIncoming, evaluation.winner)
    if (!safety.allowSuppress) {
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.ingestion.duplicateScoringDecision, {
          matchType: 'soft_date_window',
          duplicateDecision: false,
          candidateCount: rows.length,
          duplicateConfidence: evaluation.confidence,
          scoreBucket: scoreBucketFromScore(evaluation.bestScore),
          tieBreakId: evaluation.tieBreakId,
          sourcePlatform: platform,
          context: 'external_list_insert_skip_safety_blocked',
          safetyBlockedReasons: safety.blockedReasons,
        })
      )
      return {
        skip: false,
        duplicateOfId: null,
        evaluation,
        skipKind: null,
      }
    }

    const skipKind = 'duplicate_cross_city_page' as const
    const suppressionReason = suppressionReasonFromEvaluation(evaluation, skipKind)
    await recordIngestedSaleSoftDedupeSuppression(admin, {
      context: 'external_list_insert_skip',
      sourcePlatform: platform,
      sourceUrl: probe.sourceUrl,
      duplicateOfId: evaluation.winner.id,
      evaluation,
      suppressionReason,
      incomingSaleInstanceKey: safetyIncoming.saleInstanceKey ?? null,
      matchedSaleInstanceKey: evaluation.winner.sale_instance_key ?? null,
    })

    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.duplicateScoringDecision, {
        matchType: 'soft_date_window',
        duplicateDecision: true,
        candidateCount: rows.length,
        duplicateConfidence: evaluation.confidence,
        scoreBucket: scoreBucketFromScore(evaluation.bestScore),
        tieBreakId: evaluation.tieBreakId,
        sourcePlatform: platform,
        context: 'external_list_insert_skip',
        suppressionReason,
        incomingSaleInstanceKey: safetyIncoming.saleInstanceKey ?? null,
        matchedSaleInstanceKey: evaluation.winner.sale_instance_key ?? null,
      })
    )
    const result: ExternalListDuplicateSkipResult = {
      skip: true,
      duplicateOfId: evaluation.winner.id,
      evaluation,
      skipKind,
    }
    await maybeRecordCrossProviderShadowOnExternalIngest(
      platform,
      probe,
      result,
      'external_list_insert_skip'
    )
    return result
  }
  const result: ExternalListDuplicateSkipResult = {
    skip: false,
    duplicateOfId: null,
    evaluation: rows.length > 0 ? evaluation : null,
    skipKind: null,
  }
  await maybeRecordCrossProviderShadowOnExternalIngest(
    platform,
    probe,
    result,
    'external_list_insert_skip'
  )
  return result
}

export async function findIngestedSaleMatch(
  sourceUrl: string,
  processed: ProcessedIngestedSale,
  context?: DedupeTelemetryContext
): Promise<{ match: IngestedSaleMatch | null; meta: { softScoringRejected?: boolean } }> {
  const admin = getAdminDb()

  const bySource = await findPrimaryIngestedSaleBySourceUrl(admin, sourceUrl, 'id')
  if (bySource?.id) {
    emitDedupeDecision({
      processed,
      matchType: 'source_url',
      duplicateDecision: false,
      candidateCount: 1,
      dateDeltaBucket: 'not_applicable',
      sourcePlatform: context?.sourcePlatform,
      duplicateConfidence: 'exact_duplicate',
    })
    return {
      match: {
        id: bySource.id,
        matchType: 'source_url',
        duplicateConfidence: 'exact_duplicate',
        suppressAsDuplicate: false,
      },
      meta: {},
    }
  }

  if (!processed.normalizedAddress || !processed.dateStart) {
    emitDedupeDecision({
      processed,
      matchType: 'none',
      duplicateDecision: false,
      candidateCount: 0,
      dateDeltaBucket: 'not_applicable',
      sourcePlatform: context?.sourcePlatform,
      duplicateConfidence: 'distinct_listing',
    })
    return { match: null, meta: {} }
  }

  const byAddressDate = await fromBase(admin, 'ingested_sales')
    .select('id')
    .eq('normalized_address', processed.normalizedAddress)
    .eq('date_start', processed.dateStart)
    .maybeSingle()
  if (byAddressDate.data?.id) {
    emitDedupeDecision({
      processed,
      matchType: 'exact_address_date',
      duplicateDecision: false,
      candidateCount: 1,
      dateDeltaBucket: 'same_day',
      sourcePlatform: context?.sourcePlatform,
      duplicateConfidence: 'exact_duplicate',
    })
    return {
      match: {
        id: byAddressDate.data.id,
        matchType: 'address_date',
        duplicateConfidence: 'exact_duplicate',
        suppressAsDuplicate: false,
      },
      meta: {},
    }
  }

  const incoming = buildIncomingForScoring(sourceUrl, processed, context)
  const softCandidates = await fetchSoftAddressCandidates(
    admin,
    processed.normalizedAddress,
    processed.dateStart
  )
  const evaluation = evaluateSoftDuplicateAgainstCandidates(incoming, softCandidates)

  if (evaluation.suppress && evaluation.winner) {
    const safetyIncoming = buildSoftDedupeSafetyIncomingFromProcessed(sourceUrl, processed, context)
    const safety = evaluateSoftDedupeSuppressionSafety(safetyIncoming, evaluation.winner)
    if (!safety.allowSuppress) {
      emitDedupeDecision({
        processed,
        matchType: 'soft_date_window',
        duplicateDecision: false,
        candidateCount: softCandidates.length,
        dateDeltaBucket: 'not_applicable',
        sourcePlatform: context?.sourcePlatform,
        duplicateConfidence: evaluation.confidence,
        scoreBucket: scoreBucketFromScore(evaluation.bestScore),
        tieBreakId: evaluation.tieBreakId,
      })
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.ingestion.duplicateScoringDecision, {
          matchType: 'soft_date_window',
          duplicateDecision: false,
          candidateCount: softCandidates.length,
          duplicateConfidence: evaluation.confidence,
          scoreBucket: scoreBucketFromScore(evaluation.bestScore),
          tieBreakId: evaluation.tieBreakId,
          sourcePlatform: context?.sourcePlatform || 'unknown',
          context: 'ingested_sale_soft_match_safety_blocked',
          safetyBlockedReasons: safety.blockedReasons,
        })
      )
      return { match: null, meta: { softScoringRejected: true } }
    }

    const suppressionReason = suppressionReasonFromEvaluation(evaluation, null)
    await recordIngestedSaleSoftDedupeSuppression(admin, {
      context: 'ingested_sale_soft_match',
      sourcePlatform: context?.sourcePlatform || 'unknown',
      sourceUrl,
      duplicateOfId: evaluation.winner.id,
      evaluation,
      suppressionReason,
      incomingSaleInstanceKey: safetyIncoming.saleInstanceKey ?? null,
      matchedSaleInstanceKey: evaluation.winner.sale_instance_key ?? null,
    })

    const dayDelta = Math.round(
      (new Date(`${evaluation.winner.date_start}T00:00:00.000Z`).getTime() -
        new Date(`${processed.dateStart}T00:00:00.000Z`).getTime()) /
        86_400_000
    )
    emitDedupeDecision({
      processed,
      matchType: 'soft_date_window',
      duplicateDecision: true,
      candidateCount: softCandidates.length,
      dateDeltaBucket: dateDeltaBucketFromDays(dayDelta),
      sourcePlatform: context?.sourcePlatform,
      duplicateConfidence: evaluation.confidence,
      scoreBucket: scoreBucketFromScore(evaluation.bestScore),
      tieBreakId: evaluation.tieBreakId,
    })
    return {
      match: {
        id: evaluation.winner.id,
        matchType: 'soft_address_date',
        duplicateConfidence: evaluation.confidence,
        suppressAsDuplicate: true,
      },
      meta: {},
    }
  }

  if (softCandidates.length > 0 && evaluation.confidence === 'weak_match') {
    emitDedupeDecision({
      processed,
      matchType: 'soft_date_window',
      duplicateDecision: false,
      candidateCount: softCandidates.length,
      dateDeltaBucket: 'not_applicable',
      sourcePlatform: context?.sourcePlatform,
      duplicateConfidence: 'weak_match',
      scoreBucket: scoreBucketFromScore(evaluation.bestScore),
      tieBreakId: evaluation.tieBreakId,
    })
    return { match: null, meta: { softScoringRejected: true } }
  }

  emitDedupeDecision({
    processed,
    matchType: 'none',
    duplicateDecision: false,
    candidateCount: softCandidates.length,
    dateDeltaBucket: 'not_applicable',
    sourcePlatform: context?.sourcePlatform,
    duplicateConfidence: 'distinct_listing',
    scoreBucket: 'none',
  })
  return { match: null, meta: {} }
}
