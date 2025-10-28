import { vi } from 'vitest'

type Result<T = any> = { data: T; error: null } | { data: null; error: { message: string } }

export function makeSupabaseQueryChain<T = any>(results: Result<T> | Result<T>[]) {
  const queue = Array.isArray(results) ? [...results] : [results]

  const next = () => (queue.length ? queue.shift()! : { data: [], error: null })

  // Builder chain object (will be returned by every method)
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    in: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    throwOnError: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(next())),
    maybeSingle: vi.fn(() => Promise.resolve(next())),

    // Terminal methods return a Promise (so `await` works)
    limit: vi.fn((n?: number) => Promise.resolve(next())),
    range: vi.fn((from?: number, to?: number) => Promise.resolve(next())),
    
    // If the code sometimes directly awaits after .order or .throwOnError with no terminal,
    // make the chain thenable as a fallback:
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(next()).then(onFulfilled, onRejected),
  }

  return chain
}

export function makeSupabaseFromMock(map: Record<string, Result[]>) {
  return vi.fn((table: string) => {
    const results = map[table] ?? [{ data: [], error: null }]
    return makeSupabaseQueryChain(results)
  })
}

export function makeSupabaseClientMock(map: Record<string, Result[]>) {
  const from = makeSupabaseFromMock(map)
  
  return {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(() => makeSupabaseQueryChain([{ data: [], error: null }])),
  }
}
