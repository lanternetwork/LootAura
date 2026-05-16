import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import {
  isIngestionOrchestrationLeaseActiveAt,
  isStaleOrchestrationLeaseAt,
} from '@/lib/operationalResilience/ingestionOrchestrationLeaseGate'
import { logger } from '@/lib/log'

export const SOURCE_DISCOVERY_STATE_KEY = 'source_discovery_nationwide'

type AdminDb = ReturnType<typeof getAdminDb>

export type DiscoveryStateRow = {
  state_cursor: number
  lease_owner: string | null
  lease_expires_at: string | null
}

export type DiscoveryLeaseAcquireResult = {
  acquired: boolean
  owner: string
  staleRecovered: boolean
  stateCursor: number
  reason?: 'active_lease' | 'acquire_failed' | 'lost_race'
}

export async function ensureDiscoveryStateRow(admin: AdminDb): Promise<void> {
  const { error } = await fromBase(admin, 'ingestion_discovery_state').upsert(
    { key: SOURCE_DISCOVERY_STATE_KEY, state_cursor: 0 },
    { onConflict: 'key', ignoreDuplicates: true }
  )
  if (error) {
    throw new Error(`ensure_discovery_state: ${error.message}`)
  }
}

export async function acquireDiscoveryOrchestrationLease(
  admin: AdminDb,
  owner: string,
  leaseSeconds: number
): Promise<DiscoveryLeaseAcquireResult> {
  await ensureDiscoveryStateRow(admin)
  const nowMs = Date.now()
  const leaseExpiresAtIso = new Date(nowMs + leaseSeconds * 1000).toISOString()

  const { data: stateRows, error: selectError } = await fromBase(admin, 'ingestion_discovery_state')
    .select('state_cursor, lease_owner, lease_expires_at')
    .eq('key', SOURCE_DISCOVERY_STATE_KEY)
    .limit(1)

  if (selectError || !Array.isArray(stateRows) || stateRows.length === 0) {
    return {
      acquired: false,
      owner,
      staleRecovered: false,
      stateCursor: 0,
      reason: 'acquire_failed',
    }
  }

  const current = stateRows[0] as DiscoveryStateRow
  const ownerNow = current.lease_owner ?? null
  const expiresNow = current.lease_expires_at ?? null

  if (isIngestionOrchestrationLeaseActiveAt(nowMs, ownerNow, expiresNow)) {
    return {
      acquired: false,
      owner,
      staleRecovered: false,
      stateCursor: current.state_cursor ?? 0,
      reason: 'active_lease',
    }
  }

  const staleRecovered = isStaleOrchestrationLeaseAt(nowMs, ownerNow, expiresNow)
  const leaseUpdatePayload = {
    lease_owner: owner,
    lease_expires_at: leaseExpiresAtIso,
    last_started_at: new Date(nowMs).toISOString(),
    updated_at: new Date(nowMs).toISOString(),
  }

  let leaseUpdateQuery = fromBase(admin, 'ingestion_discovery_state')
    .update(leaseUpdatePayload)
    .eq('key', SOURCE_DISCOVERY_STATE_KEY)

  leaseUpdateQuery =
    ownerNow === null
      ? leaseUpdateQuery.is('lease_owner', null)
      : leaseUpdateQuery.eq('lease_owner', ownerNow)
  leaseUpdateQuery =
    expiresNow === null
      ? leaseUpdateQuery.is('lease_expires_at', null)
      : leaseUpdateQuery.eq('lease_expires_at', expiresNow)

  const { data: updatedRows, error: updateError } = await leaseUpdateQuery.select('state_cursor')

  if (updateError || !Array.isArray(updatedRows) || updatedRows.length === 0) {
    return {
      acquired: false,
      owner,
      staleRecovered: false,
      stateCursor: current.state_cursor ?? 0,
      reason: 'lost_race',
    }
  }

  logger.info('source discovery lease acquired', {
    component: 'ingestion/discovery/discoveryOrchestrationLease',
    operation: 'lease_acquire',
    staleRecovered,
  })

  return {
    acquired: true,
    owner,
    staleRecovered,
    stateCursor: (updatedRows[0]?.state_cursor as number | null) ?? (current.state_cursor ?? 0),
  }
}

export async function releaseDiscoveryOrchestrationLease(
  admin: AdminDb,
  params: { owner: string; nextStateCursor: number; markCompleted: boolean }
): Promise<void> {
  const payload: Record<string, unknown> = {
    state_cursor: params.nextStateCursor,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  }
  if (params.markCompleted) {
    payload.last_completed_at = new Date().toISOString()
  }

  const { data, error } = await fromBase(admin, 'ingestion_discovery_state')
    .update(payload)
    .eq('key', SOURCE_DISCOVERY_STATE_KEY)
    .eq('lease_owner', params.owner)
    .select('key')

  if (error || !Array.isArray(data) || data.length === 0) {
    logger.warn('source discovery lease release incomplete', {
      component: 'ingestion/discovery/discoveryOrchestrationLease',
      operation: 'lease_release',
      message: error?.message,
    })
  }
}
