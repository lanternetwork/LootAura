import { ProcessedIngestedSale } from '@/lib/ingestion/types'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export interface IngestedSaleMatch {
  id: string
  matchType: 'source_url' | 'address_date' | 'soft_address_date'
}

type DedupeDecisionMatchType = 'source_url' | 'exact_address_date' | 'soft_date_window' | 'none'
type DateDeltaBucket = 'not_applicable' | 'same_day' | 'minus_1_day' | 'plus_1_day'

type DedupeTelemetryContext = {
  sourcePlatform?: string
}

export type DedupeDecisionAggregate = {
  source_url: number
  exact_address_date: number
  soft_date_window: number
  no_match: number
  duplicateDecisionTrue: number
  duplicateDecisionFalse: number
}

export function createEmptyDedupeDecisionAggregate(): DedupeDecisionAggregate {
  return {
    source_url: 0,
    exact_address_date: 0,
    soft_date_window: 0,
    no_match: 0,
    duplicateDecisionTrue: 0,
    duplicateDecisionFalse: 0,
  }
}

export function accumulateDedupeDecisionAggregate(
  aggregate: DedupeDecisionAggregate,
  match: IngestedSaleMatch | null
): DedupeDecisionAggregate {
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
    aggregate.soft_date_window += 1
    aggregate.duplicateDecisionTrue += 1
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

function emitDedupeDecision(params: {
  processed: ProcessedIngestedSale
  matchType: DedupeDecisionMatchType
  duplicateDecision: boolean
  candidateCount: number
  dateDeltaBucket: DateDeltaBucket
  sourcePlatform?: string
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
  })
}

export async function findIngestedSaleMatch(
  sourceUrl: string,
  processed: ProcessedIngestedSale,
  context?: DedupeTelemetryContext
): Promise<IngestedSaleMatch | null> {
  const admin = getAdminDb()

  const bySource = await fromBase(admin, 'ingested_sales')
    .select('id')
    .eq('source_url', sourceUrl)
    .maybeSingle()
  if (bySource.data?.id) {
    emitDedupeDecision({
      processed,
      matchType: 'source_url',
      duplicateDecision: false,
      candidateCount: 1,
      dateDeltaBucket: 'not_applicable',
      sourcePlatform: context?.sourcePlatform,
    })
    return { id: bySource.data.id, matchType: 'source_url' }
  }

  if (!processed.normalizedAddress || !processed.dateStart) {
    emitDedupeDecision({
      processed,
      matchType: 'none',
      duplicateDecision: false,
      candidateCount: 0,
      dateDeltaBucket: 'not_applicable',
      sourcePlatform: context?.sourcePlatform,
    })
    return null
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
    })
    return { id: byAddressDate.data.id, matchType: 'address_date' }
  }

  const softCandidates = await fromBase(admin, 'ingested_sales')
    .select('id, date_start')
    .eq('normalized_address', processed.normalizedAddress)
    .not('date_start', 'is', null)
    .limit(50)

  if (softCandidates.data && softCandidates.data.length > 0) {
    const current = new Date(`${processed.dateStart}T00:00:00Z`).getTime()
    const oneDayMs = 24 * 60 * 60 * 1000
    const match = softCandidates.data.find((row: { id: string; date_start: string }) => {
      const candidate = new Date(`${row.date_start}T00:00:00Z`).getTime()
      return Math.abs(candidate - current) <= oneDayMs
    })
    if (match) {
      const currentDays = Math.floor(current / oneDayMs)
      const candidateDays = Math.floor(new Date(`${match.date_start}T00:00:00Z`).getTime() / oneDayMs)
      emitDedupeDecision({
        processed,
        matchType: 'soft_date_window',
        duplicateDecision: true,
        candidateCount: softCandidates.data.length,
        dateDeltaBucket: dateDeltaBucketFromDays(candidateDays - currentDays),
        sourcePlatform: context?.sourcePlatform,
      })
      return { id: match.id, matchType: 'soft_address_date' }
    }
  }

  emitDedupeDecision({
    processed,
    matchType: 'none',
    duplicateDecision: false,
    candidateCount: softCandidates.data?.length ?? 0,
    dateDeltaBucket: 'not_applicable',
    sourcePlatform: context?.sourcePlatform,
  })
  return null
}

