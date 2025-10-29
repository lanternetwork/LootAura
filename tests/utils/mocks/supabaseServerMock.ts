import { vi } from 'vitest'

type Result<T = any> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }
  | { count: number; error: null }

export function makeSupabaseFromMock(map: Record<string, Result[]>) {
  return vi.fn((table: string) => {
    const results = map[table] ?? [{ data: [], error: null }]
    const queue = [...results]

    const next = () => (queue.length ? queue.shift()! : { data: [], error: null })

    // Builder chain object (will be returned by every method)
    const chain: any = {
      select: vi.fn((columns?: string | string[], options?: any) => {
        // Handle count queries with head: true
        if (options?.count === 'exact' && options?.head === true) {
          return {
            eq: vi.fn(() => Promise.resolve(next())),
            gte: vi.fn(() => Promise.resolve(next())),
            lte: vi.fn(() => Promise.resolve(next())),
            in: vi.fn(() => Promise.resolve(next())),
            or: vi.fn(() => Promise.resolve(next())),
            order: vi.fn(() => Promise.resolve(next())),
            range: vi.fn(() => Promise.resolve(next())),
            limit: vi.fn(() => Promise.resolve(next())),
            single: vi.fn(() => Promise.resolve(next())),
            maybeSingle: vi.fn(() => Promise.resolve(next())),
            then: (onFulfilled: any, onRejected: any) => Promise.resolve(next()).then(onFulfilled, onRejected),
          }
        }
        // Regular select query - return the chain
        return chain
      }),
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      in: vi.fn(() => chain),
      or: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(next())),
      range: vi.fn(() => Promise.resolve(next())),
      single: vi.fn(() => Promise.resolve(next())),
      maybeSingle: vi.fn(() => Promise.resolve(next())),
      // If the code sometimes directly awaits after .order or other methods with no terminal,
      // make the chain thenable as a fallback:
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(next()).then(onFulfilled, onRejected),
    }

    return chain
  })
}

export function mockCreateSupabaseServerClient(from: ReturnType<typeof makeSupabaseFromMock>) {
  return {
    createSupabaseServerClient: vi.fn(() => ({
      from,
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
    })),
  }
}
