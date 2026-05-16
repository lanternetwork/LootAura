import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => ({
  chainComplete: 0,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: vi.fn(() => ({
    update: () => ({
      eq(col: string, _val: unknown) {
        expect(col).toBe('id')
        return {
          eq(col2: string, val2: unknown) {
            expect(col2).toBe('status')
            expect(val2).toBe('publishing')
            hoisted.chainComplete += 1
            return Promise.resolve({
              error: hoisted.chainComplete === 1 ? { message: 'transient' } : null,
            })
          },
        }
      },
    }),
  })),
}))

vi.mock('@/lib/ingestion/publish', () => ({
  createPublishedSale: vi.fn(),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('tryPersistPublishFailedWhilePublishing', () => {
  beforeEach(() => {
    hoisted.chainComplete = 0
    vi.resetModules()
  })

  it('only updates while status is publishing (two guarded attempts; no id-only fallback)', async () => {
    const { tryPersistPublishFailedWhilePublishing } = await import('@/lib/ingestion/publishWorker')
    const ok = await tryPersistPublishFailedWhilePublishing(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      { status: 'publish_failed', failure_reasons: [] },
      { operation: 'test_op', phase: 'create_sale' }
    )
    expect(ok).toBe(true)
    expect(hoisted.chainComplete).toBe(2)
  })
})
