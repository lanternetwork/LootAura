import { vi } from 'vitest'

export function makeSupabaseFromMock(map: Record<string, any[]>) {
	// Maintain per-table queues so multiple calls consume sequentially
	const tableToQueue = new Map<string, Array<any>>()

	// Prime queues
	for (const [table, results] of Object.entries(map)) {
		tableToQueue.set(table, [...results])
	}

	const getNextForTable = (table: string): any => {
		const q = tableToQueue.get(table) || []
		if (q.length === 0) return { data: [], error: null }
		return q.shift()
	}

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

// Convenience helper expected by tests: installs a Supabase server mock with table data
// Accepts either row arrays (converted to { data: rows, error: null }) or Result arrays directly
export function mockSupabaseServer(tables: Record<string, any[]>) {
	const from = makeSupabaseFromMock(
		Object.fromEntries(
			Object.entries(tables).map(([table, value]) => {
				// If first element is a Result (has 'data' or 'count' property and 'error'), treat as Result[]
				if (Array.isArray(value) && value.length > 0 && (typeof value[0] === 'object' && ('data' in value[0] || 'count' in value[0]))) {
					return [table, value as any[]]
				}
				// Otherwise treat as row array and wrap in { data: rows, error: null }
				return [table, [{ data: value, error: null } as any]]
			})
		)
	) as any

	vi.mock('@/lib/supabase/server', () => mockCreateSupabaseServerClient(from))
}
