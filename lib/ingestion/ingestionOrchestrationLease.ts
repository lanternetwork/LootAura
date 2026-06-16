import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger, generateOperationId } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import {
  isIngestionOrchestrationLeaseActiveAt,
  isStaleOrchestrationLeaseAt,
  parseIngestionOrchestrationLeaseSeconds,
} from '@/lib/operationalResilience/ingestionOrchestrationLeaseGate'

export type IngestionOrchestrationLease = {
  acquired: boolean
  owner: string
  staleRecovered: boolean
  cursor: number
  longTailCursor?: number
  reason?: 'active_lease' | 'acquire_failed' | 'lost_race'
}

type IngestionOrchestrationStateRow = {
  cursor: number | null
  long_tail_cursor?: number | null
  lease_owner: string | null
  lease_expires_at: string | null
}

export async function ensureIngestionOrchestrationStateRow(
  stateKey: string,
  logContext: Record<string, unknown>
): Promise<void> {
  const adminDb = getAdminDb()
  const { error } = await fromBase(adminDb, 'ingestion_orchestration_state').upsert(
    { key: stateKey, cursor: 0 },
    { onConflict: 'key', ignoreDuplicates: true }
  )
  if (error) {
    logger.error('Failed to ensure ingestion orchestration state row', new Error(error.message), {
      ...logContext,
      operation: 'ensure_orchestration_state',
      stateKey,
    })
    throw new Error('Failed to ensure ingestion orchestration state')
  }
}

export async function acquireIngestionOrchestrationLease(
  stateKey: string,
  logContext: Record<string, unknown>,
  options?: { includeLongTailCursor?: boolean }
): Promise<IngestionOrchestrationLease> {
  const emitLeaseTelemetry = (result: IngestionOrchestrationLease): IngestionOrchestrationLease => {
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.ingestion.orchestrationLeaseOutcome, {
        acquired: result.acquired,
        staleRecovered: result.staleRecovered,
        cursor: result.cursor,
        overlapContention:
          !result.acquired && (result.reason === 'active_lease' || result.reason === 'lost_race'),
        reason: result.reason ?? (result.acquired ? 'acquired' : 'none'),
        stateKey,
        ...(logContext.laneKey != null ? { laneKey: logContext.laneKey } : {}),
      })
    )
    return result
  }

  await ensureIngestionOrchestrationStateRow(stateKey, logContext)
  const adminDb = getAdminDb()
  const owner = generateOperationId()
  const nowMs = Date.now()
  const leaseSeconds = parseIngestionOrchestrationLeaseSeconds(process.env.INGESTION_ORCHESTRATION_LEASE_SECONDS)
  const leaseExpiresAtIso = new Date(nowMs + leaseSeconds * 1000).toISOString()

  const selectColumns = 'cursor, long_tail_cursor, lease_owner, lease_expires_at' as const

  const { data: stateRows, error: selectError } = await fromBase(adminDb, 'ingestion_orchestration_state')
    .select(selectColumns)
    .eq('key', stateKey)
    .limit(1)
  if (selectError || !Array.isArray(stateRows) || stateRows.length === 0) {
    logger.error(
      'Failed to load ingestion orchestration state',
      new Error(selectError?.message || 'row missing'),
      { ...logContext, operation: 'lease_acquire', stateKey }
    )
    return emitLeaseTelemetry({ acquired: false, owner, staleRecovered: false, cursor: 0, reason: 'acquire_failed' })
  }

  const current = stateRows[0] as unknown as IngestionOrchestrationStateRow
  const ownerNow = current.lease_owner ?? null
  const expiresNow = current.lease_expires_at ?? null
  const longTailCursor = current.long_tail_cursor ?? current.cursor ?? 0

  const leaseResult = (partial: Omit<IngestionOrchestrationLease, 'longTailCursor'>): IngestionOrchestrationLease =>
    options?.includeLongTailCursor ? { ...partial, longTailCursor } : partial

  if (isIngestionOrchestrationLeaseActiveAt(nowMs, ownerNow, expiresNow)) {
    logger.info('Ingestion orchestration lease already active; skipping overlapping run', {
      ...logContext,
      operation: 'lease_acquire',
      overlapPrevented: true,
      stateKey,
    })
    return emitLeaseTelemetry(
      leaseResult({
        acquired: false,
        owner,
        staleRecovered: false,
        cursor: current.cursor ?? 0,
        reason: 'active_lease',
      })
    )
  }

  const staleRecovered = isStaleOrchestrationLeaseAt(nowMs, ownerNow, expiresNow)
  const leaseUpdatePayload = {
    lease_owner: owner,
    lease_expires_at: leaseExpiresAtIso,
    last_started_at: new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
  }
  let leaseUpdateQuery = fromBase(adminDb, 'ingestion_orchestration_state')
    .update(leaseUpdatePayload)
    .eq('key', stateKey)

  leaseUpdateQuery =
    ownerNow === null
      ? leaseUpdateQuery.is('lease_owner', null)
      : leaseUpdateQuery.eq('lease_owner', ownerNow)
  leaseUpdateQuery =
    expiresNow === null
      ? leaseUpdateQuery.is('lease_expires_at', null)
      : leaseUpdateQuery.eq('lease_expires_at', expiresNow)

  const { data: updatedRows, error: updateError } = await leaseUpdateQuery.select('cursor')

  if (updateError || !Array.isArray(updatedRows) || updatedRows.length === 0) {
    logger.warn('Ingestion orchestration lease acquire lost race; skipping run', {
      ...logContext,
      operation: 'lease_acquire',
      overlapPrevented: true,
      stateKey,
      message: updateError?.message,
    })
    return emitLeaseTelemetry(
      leaseResult({
        acquired: false,
        owner,
        staleRecovered: false,
        cursor: current.cursor ?? 0,
        reason: 'lost_race',
      })
    )
  }

  logger.info('Ingestion orchestration lease acquired', {
    ...logContext,
    operation: 'lease_acquire',
    staleRecovered,
    stateKey,
  })
  return emitLeaseTelemetry(
    leaseResult({
      acquired: true,
      owner,
      staleRecovered,
      cursor: (updatedRows[0]?.cursor as number | null) ?? (current.cursor ?? 0),
    })
  )
}

export async function releaseIngestionOrchestrationLease(
  stateKey: string,
  logContext: Record<string, unknown>,
  params: {
    owner: string
    nextCursor: number
    nextLongTailCursor?: number
    updateLegacyCursor?: boolean
    markCompleted: boolean
  }
): Promise<void> {
  const adminDb = getAdminDb()
  const updateLegacyCursor = params.updateLegacyCursor !== false
  const payload: Record<string, unknown> = {
    lease_owner: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  }
  if (updateLegacyCursor) {
    payload.cursor = params.nextCursor
  }
  if (params.nextLongTailCursor != null) {
    payload.long_tail_cursor = params.nextLongTailCursor
  }
  if (params.markCompleted) {
    payload.last_completed_at = new Date().toISOString()
  }
  const { data, error } = await fromBase(adminDb, 'ingestion_orchestration_state')
    .update(payload)
    .eq('key', stateKey)
    .eq('lease_owner', params.owner)
    .select('key')
  if (error || !Array.isArray(data) || data.length === 0) {
    logger.warn('Failed to release ingestion orchestration lease cleanly', {
      ...logContext,
      operation: 'lease_release',
      stateKey,
      message: error?.message,
    })
  }
}
