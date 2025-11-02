// tests/utils/mocks/supabaseServerStable.ts
type SelectOpts = { count?: 'exact'; head?: boolean }

function makeQueryChain(table: string) {
  // one shared chain per call
  const chain: any = {
    select: (_cols: string, opts?: SelectOpts) => {
      // if this was the count/head branch, return a thenable right away
      if (opts?.count === 'exact' && opts?.head === true) {
        return {
          eq: (_col: string, _val: unknown) => {
            return Promise.resolve({ count: 0, error: null })
          },
        }
      }
      // normal select: return chain for .gte/.lte/...
      return chain
    },
    eq: (_c: string, _v: unknown) => chain,
    gte: (_c: string, _v: unknown) => chain,
    lte: (_c: string, _v: unknown) => chain,
    in: (_c: string, _v: unknown[]) => chain,
    or: (_expr: string) => chain,
    order: (_c: string, _cfg?: any) => chain,
    range: (_from: number, _to: number) =>
      Promise.resolve({ data: [], error: null }),
    limit: (_n: number) => chain,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),

    // this is the one that was failing - must always exist and be callable
    insert: (_rows: any) => ({
      select: (_cols?: string) => ({
        single: () => Promise.resolve({ data: _rows ? Array.isArray(_rows) ? _rows[0] : _rows : null, error: null }),
      }),
    }),

    update: (_data: any) => Promise.resolve({ data: [], error: null }),
    delete: () => Promise.resolve({ data: [], error: null }),
  }

  return chain
}

export function makeStableSupabaseClient() {
  const client: any = {
    from: (table: string) => makeQueryChain(table),
    // some routes call auth.getUser()
    auth: {
      getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }),
    },
  }
  return client
}

