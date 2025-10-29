import { vi } from 'vitest'

type Row = Record<string, any>

// New: make a per-table chain that always returns a fluent builder from select()
function makeTableChain(rows: Row[], countValue = rows.length) {
  let filters: Array<{ col: string; op: 'eq' | 'gte' | 'lte'; val: any }> = []
  let countMode = false
  let start = 0
  let end: number | null = null

  const applyFilters = () =>
    rows.filter((r) =>
      filters.every((f) => {
        const v = r[f.col]
        if (f.op === 'eq') return v === f.val
        if (f.op === 'gte') return v >= f.val
        if (f.op === 'lte') return v <= f.val
        return true
      })
    )

  const resolveRange = () => {
    const filtered = applyFilters()
    const sliced = end == null ? filtered.slice(start) : filtered.slice(start, end + 1)
    return { data: sliced, count: filtered.length, error: null }
  }

  const chain: any = {
    // Builder methods
    select: (_sel?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) => {
      countMode = !!opts?.count
      return chain
    },
    eq: (col: string, val: any) => {
      if (countMode) {
        const out = Promise.resolve({ data: null, count: countValue, error: null })
        countMode = false
        return out
      }
      filters.push({ col, op: 'eq', val })
      return chain
    },
    gte: (col: string, val: any) => {
      filters.push({ col, op: 'gte', val })
      return chain
    },
    lte: (col: string, val: any) => {
      filters.push({ col, op: 'lte', val })
      return chain
    },
    in: () => chain,
    or: () => chain,
    order: () => chain,

    // Terminal methods
    range: (s: number, e: number) => {
      start = s
      end = e
      return Promise.resolve(resolveRange())
    },
    limit: (n: number) => {
      start = 0
      end = n - 1
      return Promise.resolve(resolveRange())
    },
    single: () => Promise.resolve({ data: applyFilters()[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: applyFilters()[0] ?? null, error: null }),
  }

  // Important: do NOT set chain.then to avoid accidental thenable behavior
  return chain
}

// Back-compat: provide previous APIs, but implemented via table rows
export function makeSupabaseFromMock(map: Record<string, Array<{ id?: string }>>) {
  return vi.fn((table: string) => makeTableChain((map as any)[table] ?? [], ((map as any)[table] ?? []).length))
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

// New: high-level helper to mock the server by table name → rows
export function mockSupabaseServer(tables: Record<string, Row[]>) {
  vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: () => ({
      from: (table: string) => makeTableChain(tables[table] ?? [], (tables[table] ?? []).length),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      },
    }),
  }))
}
