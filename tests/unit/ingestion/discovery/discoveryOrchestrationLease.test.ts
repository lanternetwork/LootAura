import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireDiscoveryOrchestrationLease,
  migrateLegacyDiscoveryStateKeys,
  releaseDiscoveryOrchestrationLease,
  SOURCE_DISCOVERY_STATE_KEY,
} from '@/lib/ingestion/discovery/discoveryOrchestrationLease'

type StateRow = {
  key: string
  state_cursor: number
  lease_owner: string | null
  lease_expires_at: string | null
  last_started_at?: string | null
  last_completed_at?: string | null
  updated_at?: string | null
}

const rows = new Map<string, StateRow>()

function getRow(key: string): StateRow | undefined {
  return rows.get(key)
}

function matches(row: StateRow, col: string, expected: unknown): boolean {
  const actual = (row as Record<string, unknown>)[col]
  if (expected === null) return actual == null
  return actual === expected
}

function buildUpdateChain(row: StateRow, patch: Partial<StateRow>) {
  const applySelect = () => {
    Object.assign(row, patch)
    return Promise.resolve({ data: [{ state_cursor: row.state_cursor }], error: null })
  }
  const emptySelect = () => Promise.resolve({ data: [] as { state_cursor: number }[], error: null })

  const chain = {
    eq(col: string, val: unknown) {
      if (!matches(row, col, val)) {
        return { eq: () => chain, is: () => chain, select: emptySelect }
      }
      return chain
    },
    is(col: string, val: null) {
      if (!matches(row, col, val)) {
        return { eq: () => chain, is: () => chain, select: emptySelect }
      }
      return chain
    },
    select: applySelect,
  }
  return chain
}

/** Supports await update().eq() (merge) and update().eq().is()….select() (lease acquire). */
function buildThenableUpdateChain(row: StateRow, patch: Partial<StateRow>) {
  const apply = () => {
    Object.assign(row, patch)
    return { data: [{ state_cursor: row.state_cursor }], error: null }
  }
  const chain = buildUpdateChain(row, patch)
  return Object.assign(chain, {
    then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(apply()).then(onFulfilled, onRejected)
    },
  })
}

function createDiscoveryStateApi() {
  return {
    upsert: (payload: { key: string; state_cursor: number }) => {
      if (!rows.has(payload.key)) {
        rows.set(payload.key, {
          key: payload.key,
          state_cursor: payload.state_cursor,
          lease_owner: null,
          lease_expires_at: null,
        })
      }
      return Promise.resolve({ error: null })
    },
    select: (_cols?: string) => ({
      eq: (_col: string, key: string) => ({
        limit: () => {
          const row = getRow(key)
          return Promise.resolve({
            data: row ? [row] : [],
            error: null,
          })
        },
      }),
    }),
    update: (patch: Partial<StateRow>) => ({
      eq: (col: string, val: unknown) => {
        if (col === 'key') {
          const row = getRow(String(val))
          if (!row) {
            return buildUpdateChain({ key: String(val), state_cursor: 0, lease_owner: null, lease_expires_at: null }, patch)
          }
          if (patch.key && patch.key !== row.key) {
            rows.delete(row.key)
            const next: StateRow = { ...row, ...patch, key: patch.key }
            rows.set(patch.key, next)
            return Promise.resolve({ data: [{ state_cursor: next.state_cursor }], error: null })
          }
          return buildThenableUpdateChain(row, patch)
        }
        return buildThenableUpdateChain(
          { key: '', state_cursor: 0, lease_owner: null, lease_expires_at: null },
          patch
        )
      },
    }),
    delete: () => ({
      eq: (_col: string, key: string) => {
        rows.delete(key)
        return Promise.resolve({ error: null })
      },
    }),
  }
}

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: (_admin: unknown, table: string) => {
    if (table !== 'ingestion_discovery_state') throw new Error(table)
    return createDiscoveryStateApi()
  },
}))

vi.mock('@/lib/log', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('discoveryOrchestrationLease', () => {
  beforeEach(() => {
    rows.clear()
    rows.set(SOURCE_DISCOVERY_STATE_KEY, {
      key: SOURCE_DISCOVERY_STATE_KEY,
      state_cursor: 4,
      lease_owner: null,
      lease_expires_at: null,
    })
  })

  it('acquires lease when idle', async () => {
    const result = await acquireDiscoveryOrchestrationLease({} as never, 'owner-a', 120)
    expect(result.acquired).toBe(true)
    expect(result.stateCursor).toBe(4)
    expect(getRow(SOURCE_DISCOVERY_STATE_KEY)?.lease_owner).toBe('owner-a')
    expect(getRow(SOURCE_DISCOVERY_STATE_KEY)?.last_started_at).toBeTruthy()
  })

  it('prevents overlap when lease is active', async () => {
    const row = getRow(SOURCE_DISCOVERY_STATE_KEY)!
    row.lease_owner = 'other'
    row.lease_expires_at = new Date(Date.now() + 60_000).toISOString()
    const result = await acquireDiscoveryOrchestrationLease({} as never, 'owner-b', 120)
    expect(result.acquired).toBe(false)
    expect(result.reason).toBe('active_lease')
  })

  it('recovers stale lease and allows acquire', async () => {
    const row = getRow(SOURCE_DISCOVERY_STATE_KEY)!
    row.lease_owner = 'stale-owner'
    row.lease_expires_at = new Date(Date.now() - 60_000).toISOString()
    const result = await acquireDiscoveryOrchestrationLease({} as never, 'owner-c', 120)
    expect(result.acquired).toBe(true)
    expect(result.staleRecovered).toBe(true)
  })

  it('releases lease and advances state cursor', async () => {
    const row = getRow(SOURCE_DISCOVERY_STATE_KEY)!
    row.lease_owner = 'owner-d'
    await releaseDiscoveryOrchestrationLease({} as never, {
      owner: 'owner-d',
      nextStateCursor: 7,
      markCompleted: true,
    })
    expect(row.state_cursor).toBe(7)
    expect(row.lease_owner).toBeNull()
    expect(row.last_completed_at).toBeTruthy()
  })
})

describe('migrateLegacyDiscoveryStateKeys', () => {
  beforeEach(() => {
    rows.clear()
  })

  it('renames ystm_nationwide when canonical row is absent', async () => {
    rows.set('ystm_nationwide', {
      key: 'ystm_nationwide',
      state_cursor: 3,
      lease_owner: null,
      lease_expires_at: null,
    })
    await migrateLegacyDiscoveryStateKeys({} as never)
    expect(rows.has('ystm_nationwide')).toBe(false)
    expect(rows.get(SOURCE_DISCOVERY_STATE_KEY)?.state_cursor).toBe(3)
  })

  it('merges cursor and deletes legacy when both keys exist', async () => {
    rows.set('ystm_nationwide', {
      key: 'ystm_nationwide',
      state_cursor: 5,
      lease_owner: null,
      lease_expires_at: null,
      last_started_at: '2026-01-01T00:00:00.000Z',
    })
    rows.set(SOURCE_DISCOVERY_STATE_KEY, {
      key: SOURCE_DISCOVERY_STATE_KEY,
      state_cursor: 2,
      lease_owner: null,
      lease_expires_at: null,
      last_started_at: '2026-06-01T00:00:00.000Z',
    })
    await migrateLegacyDiscoveryStateKeys({} as never)
    expect(rows.has('ystm_nationwide')).toBe(false)
    const canonical = rows.get(SOURCE_DISCOVERY_STATE_KEY)
    expect(canonical?.state_cursor).toBe(5)
    expect(canonical?.last_started_at).toBe('2026-06-01T00:00:00.000Z')
  })
})
