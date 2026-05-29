import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureLootauraProfileExists } from '@/lib/profile/ensureLootauraProfile'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getRlsBaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  getRlsDb: vi.fn(async () => ({
    from: mockFrom,
  })),
}))

describe('ensureLootauraProfileExists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
          user_metadata: { full_name: 'Test User' },
        },
      },
      error: null,
    })
  })

  it('returns existing profile without insert', async () => {
    const insertMock = vi.fn()
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null }),
        })),
      })),
      insert: insertMock,
      update: vi.fn(),
    })

    const result = await ensureLootauraProfileExists()
    expect(result).toEqual({ ok: true, created: false, userId: 'user-1' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates profile in v2 when missing', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }))

    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      insert: insertMock,
      update: updateMock,
    })

    const result = await ensureLootauraProfileExists()
    expect(result.ok).toBe(true)
    expect(result.created).toBe(true)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        full_name: 'Test User',
      })
    )
  })

  it('fails closed when unauthenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'no session' } })

    const result = await ensureLootauraProfileExists()
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('unauthenticated')
  })
})
