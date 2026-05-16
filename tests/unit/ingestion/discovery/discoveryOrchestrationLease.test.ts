import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireDiscoveryOrchestrationLease,
  releaseDiscoveryOrchestrationLease,
  YSTM_DISCOVERY_STATE_KEY,
} from '@/lib/ingestion/discovery/discoveryOrchestrationLease'

type StateRow = {
  key: string
  state_cursor: number
  lease_owner: string | null
  lease_expires_at: string | null
}

let state: StateRow

function emptySelect() {
  return Promise.resolve({ data: [] as { state_cursor: number }[], error: null })
}

function createDiscoveryStateApi() {
  return {
    upsert: () => Promise.resolve({ error: null }),
    select: () => ({
      eq: (_col: string, key: string) => ({
        limit: () =>
          Promise.resolve({
            data: key === state.key ? [state] : [],
            error: null,
          }),
      }),
    }),
    update: (patch: Partial<StateRow>) => {
      const apply = () => {
        Object.assign(state, patch)
        return Promise.resolve({ data: [{ state_cursor: state.state_cursor }], error: null })
      }
      return {
        eq: (col: string, val: unknown) => {
          if (col === 'key' && val !== state.key) {
            return { eq: () => ({ select: emptySelect }), is: () => ({ select: emptySelect }) }
          }
          return {
            eq: (col2: string, val2: unknown) => {
              if ((state as Record<string, unknown>)[col2] !== val2) {
                return { select: emptySelect }
              }
              return { select: apply }
            },
            is: (col2: string, val2: null) => {
              if ((state as Record<string, unknown>)[col2] !== val2) {
                return { select: emptySelect }
              }
              return { select: apply }
            },
          }
        },
      }
    },
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
    state = {
      key: YSTM_DISCOVERY_STATE_KEY,
      state_cursor: 4,
      lease_owner: null,
      lease_expires_at: null,
    }
  })

  it('acquires lease when idle', async () => {
    const result = await acquireDiscoveryOrchestrationLease({} as never, 'owner-a', 120)
    expect(result.acquired).toBe(true)
    expect(result.stateCursor).toBe(4)
    expect(state.lease_owner).toBe('owner-a')
  })

  it('prevents overlap when lease is active', async () => {
    state.lease_owner = 'other'
    state.lease_expires_at = new Date(Date.now() + 60_000).toISOString()
    const result = await acquireDiscoveryOrchestrationLease({} as never, 'owner-b', 120)
    expect(result.acquired).toBe(false)
    expect(result.reason).toBe('active_lease')
  })

  it('recovers stale lease and allows acquire', async () => {
    state.lease_owner = 'stale-owner'
    state.lease_expires_at = new Date(Date.now() - 60_000).toISOString()
    const result = await acquireDiscoveryOrchestrationLease({} as never, 'owner-c', 120)
    expect(result.acquired).toBe(true)
    expect(result.staleRecovered).toBe(true)
  })

  it('releases lease and advances state cursor', async () => {
    state.lease_owner = 'owner-d'
    await releaseDiscoveryOrchestrationLease({} as never, {
      owner: 'owner-d',
      nextStateCursor: 7,
      markCompleted: true,
    })
    expect(state.state_cursor).toBe(7)
    expect(state.lease_owner).toBeNull()
  })
})
