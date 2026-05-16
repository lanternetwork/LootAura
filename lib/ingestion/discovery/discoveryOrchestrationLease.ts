import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import {
  isIngestionOrchestrationLeaseActiveAt,
  isStaleOrchestrationLeaseAt,
} from '@/lib/operationalResilience/ingestionOrchestrationLeaseGate'
import { logger } from '@/lib/log'

export const SOURCE_DISCOVERY_STATE_KEY = 'source_discovery_nationwide'

/** Pre-rename keys; migrated to {@link SOURCE_DISCOVERY_STATE_KEY} at runtime and in migration 178. */
export const LEGACY_SOURCE_DISCOVERY_STATE_KEYS = ['ystm_nationwide'] as const

type AdminDb = ReturnType<typeof getAdminDb>

type DiscoveryStateDbRow = {
  key: string
  state_cursor: number
  lease_owner: string | null
  lease_expires_at: string | null
  last_started_at: string | null
  last_completed_at: string | null
  updated_at?: string | null
}

function pickLaterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

function pickActiveLease(
  nowMs: number,
  a: Pick<DiscoveryStateDbRow, 'lease_owner' | 'lease_expires_at'>,
  b: Pick<DiscoveryStateDbRow, 'lease_owner' | 'lease_expires_at'>
): { lease_owner: string | null; lease_expires_at: string | null } {
  const aActive =
    a.lease_owner != null &&
    a.lease_expires_at != null &&
    isIngestionOrchestrationLeaseActiveAt(nowMs, a.lease_owner, a.lease_expires_at)
  const bActive =
    b.lease_owner != null &&
    b.lease_expires_at != null &&
    isIngestionOrchestrationLeaseActiveAt(nowMs, b.lease_owner, b.lease_expires_at)
  if (bActive) return { lease_owner: b.lease_owner, lease_expires_at: b.lease_expires_at }
  if (aActive) return { lease_owner: a.lease_owner, lease_expires_at: a.lease_expires_at }
  return { lease_owner: null, lease_expires_at: null }
}

/**
 * Merges legacy `ystm_nationwide` rows into the canonical key (idempotent).
 * Mirrors supabase/migrations/178_discovery_state_key_rename.sql for pre-migration deploys.
 */
export async function migrateLegacyDiscoveryStateKeys(admin: AdminDb): Promise<void> {
  const table = fromBase(admin, 'ingestion_discovery_state')
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()

  for (const legacyKey of LEGACY_SOURCE_DISCOVERY_STATE_KEYS) {
    const { data: legacyRows, error: legacyError } = await table
      .select('key, state_cursor, lease_owner, lease_expires_at, last_started_at, last_completed_at, updated_at')
      .eq('key', legacyKey)
      .limit(1)

    if (legacyError) {
      throw new Error(`migrate_legacy_discovery_state_select: ${legacyError.message}`)
    }
    if (!Array.isArray(legacyRows) || legacyRows.length === 0) continue

    const legacy = legacyRows[0] as DiscoveryStateDbRow

    const { data: canonicalRows, error: canonicalError } = await table
      .select('key, state_cursor, lease_owner, lease_expires_at, last_started_at, last_completed_at, updated_at')
      .eq('key', SOURCE_DISCOVERY_STATE_KEY)
      .limit(1)

    if (canonicalError) {
      throw new Error(`migrate_legacy_discovery_state_canonical_select: ${canonicalError.message}`)
    }

    if (!Array.isArray(canonicalRows) || canonicalRows.length === 0) {
      const { error: renameError } = await table
        .update({ key: SOURCE_DISCOVERY_STATE_KEY, updated_at: nowIso })
        .eq('key', legacyKey)
      if (renameError) {
        throw new Error(`migrate_legacy_discovery_state_rename: ${renameError.message}`)
      }
      continue
    }

    const canonical = canonicalRows[0] as DiscoveryStateDbRow
    const activeLease = pickActiveLease(nowMs, legacy, canonical)

    const { error: mergeError } = await table
      .update({
        state_cursor: Math.max(legacy.state_cursor ?? 0, canonical.state_cursor ?? 0),
        lease_owner: activeLease.lease_owner,
        lease_expires_at: activeLease.lease_expires_at,
        last_started_at: pickLaterIso(legacy.last_started_at, canonical.last_started_at),
        last_completed_at: pickLaterIso(legacy.last_completed_at, canonical.last_completed_at),
        updated_at: nowIso,
      })
      .eq('key', SOURCE_DISCOVERY_STATE_KEY)

    if (mergeError) {
      throw new Error(`migrate_legacy_discovery_state_merge: ${mergeError.message}`)
    }

    const { error: deleteError } = await table.delete().eq('key', legacyKey)
    if (deleteError) {
      throw new Error(`migrate_legacy_discovery_state_delete: ${deleteError.message}`)
    }
  }
}

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
  await migrateLegacyDiscoveryStateKeys(admin)
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
