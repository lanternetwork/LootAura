import { vi } from 'vitest'
import { makeSupabaseClientMock } from '@/tests/utils/mocks/makeSupabaseQueryChain'

type SupabaseMockOptions = {
  tableResults?: Record<string, Array<{ data: any; error: null } | { data: null; error: { message: string } }>>
  userId?: string | null
  withStorage?: boolean
}

export function createSupabaseServerMock(options: SupabaseMockOptions = {}) {
  const base = makeSupabaseClientMock(options.tableResults ?? {})

  const userId = options.userId === undefined ? 'test-user' : options.userId
  base.auth.getUser = vi.fn().mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
    error: null,
  })

  if (options.withStorage) {
    base.storage = {
      from: vi.fn(() => ({
        createSignedUploadUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed-url.example.com' },
          error: null,
        }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://public-url.example.com/image.jpg' },
        }),
      })),
    }
  }

  return base
}
