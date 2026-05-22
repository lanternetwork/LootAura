import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DETAIL_FIRST_METRICS_BASELINE_STATE_KEY,
  setDetailFirstMetricsBaselineNow,
} from '@/lib/admin/ingestionMetricsBaseline'

const mockUpdate = vi.fn()
const mockInsert = vi.fn()
const mockFromBase = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => ({}),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

describe('setDetailFirstMetricsBaselineNow', () => {
  beforeEach(() => {
    mockUpdate.mockReset()
    mockInsert.mockReset()
    mockFromBase.mockReset()
    mockFromBase.mockReturnValue({
      update: mockUpdate,
      insert: mockInsert,
    })
  })

  it('updates existing baseline row when present', async () => {
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { detail_first_metrics_baseline_at: '2026-05-22T02:00:00.000Z' },
            error: null,
          }),
        }),
      }),
    })

    const at = await setDetailFirstMetricsBaselineNow({} as never, new Date('2026-05-22T02:00:00.000Z'))
    expect(at).toBe('2026-05-22T02:00:00.000Z')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        detail_first_metrics_baseline_at: '2026-05-22T02:00:00.000Z',
      })
    )
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts baseline row when update returns no row', async () => {
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    mockInsert.mockResolvedValue({ error: null })

    const at = await setDetailFirstMetricsBaselineNow({} as never, new Date('2026-05-22T03:00:00.000Z'))
    expect(at).toBe('2026-05-22T03:00:00.000Z')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: DETAIL_FIRST_METRICS_BASELINE_STATE_KEY,
        detail_first_metrics_baseline_at: '2026-05-22T03:00:00.000Z',
      })
    )
  })
})
