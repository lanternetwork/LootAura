import { vi } from 'vitest'

type Result<T = any> = { data: T; error: null } | { data: null; error: { message: string } } | { count: number; error: null }

export function makeSupabaseFromMock(map: Record<string, Array<Result>>) {
	// Maintain per-table queues so multiple calls consume sequentially
	const tableToQueue = new Map<string, Array<Result>>()

	// Prime queues
	for (const [table, results] of Object.entries(map)) {
		tableToQueue.set(table, [...results])
	}

	const getNextForTable = (table: string): Result => {
		const q = tableToQueue.get(table) || []
		if (q.length === 0) return { data: [], error: null }
		return q.shift() as Result
	}

	return vi.fn((table: string) => {
		const getResult = () => Promise.resolve(getNextForTable(table))
		
		const chain: any = {
			select: vi.fn((columns?: string | string[], options?: any) => {
				// For count queries with head: true, select() returns a special object
				// where eq() directly returns a Promise (not a chain)
				if (options?.count === 'exact' && options?.head === true) {
					return {
						eq: vi.fn(() => Promise.resolve(getNextForTable(table))),
						gte: vi.fn(() => Promise.resolve(getNextForTable(table))),
						lte: vi.fn(() => Promise.resolve(getNextForTable(table))),
						in: vi.fn(() => Promise.resolve(getNextForTable(table))),
						or: vi.fn(() => Promise.resolve(getNextForTable(table))),
					}
				}
				// Regular select - return the chain for further chaining
				return chain
			}),
			eq: vi.fn(() => chain),
			gte: vi.fn(() => chain),
			lte: vi.fn(() => chain),
			in: vi.fn(() => chain),
			or: vi.fn(() => chain),
			order: vi.fn(() => chain),
			// Terminal methods that actually return data
			limit: vi.fn(() => getResult()),
			range: vi.fn(() => getResult()),
			single: vi.fn(() => getResult()),
			maybeSingle: vi.fn(() => getResult()),
			// Make chain thenable so it can be awaited directly
			then: (onFulfilled: any, onRejected: any) => getResult().then(onFulfilled, onRejected),
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
export function mockSupabaseServer(tables: Record<string, any[] | Result[]>) {
	const from = makeSupabaseFromMock(
		Object.fromEntries(
			Object.entries(tables).map(([table, value]) => {
				// If first element is a Result (has 'data' or 'count' property and 'error'), treat as Result[]
				if (Array.isArray(value) && value.length > 0 && (typeof value[0] === 'object' && ('data' in value[0] || 'count' in value[0]))) {
					return [table, value as Result[]]
				}
				// Otherwise treat as row array and wrap in { data: rows, error: null }
				return [table, [{ data: value, error: null } as Result]]
			})
		)
	) as any

	vi.mock('@/lib/supabase/server', () => mockCreateSupabaseServerClient(from))
}
