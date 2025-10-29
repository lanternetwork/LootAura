import { vi } from 'vitest'

type Row = Record<string, any>

function buildChain(rows: Row[]) {
  let filters: { col: string; op: 'eq' | 'gte' | 'lte' | 'in'; val: any; vals?: any[] }[] = []
  let countMode = false
  let orderCol: string | null = null
  let orderAsc = true
  let start = 0
  let end: number | null = null

  const applyFilters = () =>
    rows.filter(r =>
      filters.every(f => {
        const v = r[f.col]
        if (f.op === 'eq') return v === f.val
        if (f.op === 'gte') return v >= f.val
        if (f.op === 'lte') return v <= f.val
        if (f.op === 'in' && f.vals) return f.vals.includes(v)
        return true
      })
    )

  const applyOrder = (arr: Row[]) => {
    if (!orderCol) return arr
    return [...arr].sort((a, b) => {
      const aVal = a[orderCol!]
      const bVal = b[orderCol!]
      if (aVal < bVal) return orderAsc ? -1 : 1
      if (aVal > bVal) return orderAsc ? 1 : -1
      return 0
    })
  }

  const resolvePaged = () => {
    const filtered = applyOrder(applyFilters())
    const sliced = end == null ? filtered.slice(start) : filtered.slice(start, end + 1)
    return { data: sliced, error: null, count: filtered.length }
  }

  const chain: any = {
    // builders
    select: (_sel?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) => {
      countMode = !!opts?.count && !!opts?.head
      return chain
    },

    eq: (col: string, val: any) => {
      if (countMode) {
        countMode = false // probe consumed
        // probe resolves immediately; do NOT return chain here
        const matching = rows.filter(r => {
          // Apply existing filters first
          const passesFilters = filters.every(f => {
            const v = r[f.col]
            if (f.op === 'eq') return v === f.val
            if (f.op === 'gte') return v >= f.val
            if (f.op === 'lte') return v <= f.val
            return true
          })
          return passesFilters && r[col] === val
        })
        const count = matching.length
        return Promise.resolve({ data: null, count, error: null })
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

    in: (col: string, vals: any[]) => {
      filters.push({ col, op: 'in', val: null, vals })
      return chain
    },

    or: (_conditions: string) => {
      // Simplified or() - accepts but doesn't filter (mock behavior)
      return chain
    },

    order: (col: string, opts?: { ascending?: boolean }) => {
      orderCol = col
      orderAsc = opts?.ascending !== false
      return chain
    },

    // terminals
    range: (s: number, e: number) => {
      start = s
      end = e
      return Promise.resolve(resolvePaged())
    },

    limit: (n: number) => {
      start = 0
      end = n - 1
      return Promise.resolve(resolvePaged())
    },

    single: () => {
      const filtered = applyFilters()
      return Promise.resolve({ data: filtered[0] ?? null, error: null })
    },

    maybeSingle: () => {
      const filtered = applyFilters()
      return Promise.resolve({ data: filtered[0] ?? null, error: null })
    },
  }

  return chain
}

export function mockSupabaseServer(tables: Record<string, Row[]>) {
  vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: () => ({
      from: (table: string) => buildChain(tables[table] ?? []),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
    }),
  }))
}

