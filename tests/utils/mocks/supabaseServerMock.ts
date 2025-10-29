import { vi } from 'vitest'

type Result<T = any> = { data: T; error: null } | { data: null; error: { message: string } } | { count: number; error: null }

export function makeSupabaseFromMock(map: Record<string, Array<{ data: any; error: any } | { count: number; error: null }>>) {
	// Maintain per-table queues so multiple calls consume sequentially
	const tableToQueue = new Map<string, Array<any>>()

	// Prime queues
	for (const [table, results] of Object.entries(map)) {
		tableToQueue.set(table, [...results])
	}

	const getNextForTable = (table: string) => {
		const q = tableToQueue.get(table) || []
		if (q.length === 0) return { data: [], error: null }
		return q.shift()
	}

	return vi.fn((table: string) => {
		// Builder chain object (returned by every method)
		const chain: any = {
			select: vi.fn((columns?: string | string[], options?: any) => {
				// Handle count queries with head: true by returning a lightweight object
				if (options?.count === 'exact' && options?.head === true) {
					return {
						eq: vi.fn(() => Promise.resolve(getNextForTable(table))),
						gte: vi.fn(() => Promise.resolve(getNextForTable(table))),
						lte: vi.fn(() => Promise.resolve(getNextForTable(table))),
						in: vi.fn(() => Promise.resolve(getNextForTable(table))),
						or: vi.fn(() => Promise.resolve(getNextForTable(table))),
						order: vi.fn(() => Promise.resolve(getNextForTable(table))),
						range: vi.fn(() => Promise.resolve(getNextForTable(table))),
						limit: vi.fn(() => Promise.resolve(getNextForTable(table))),
						single: vi.fn(() => Promise.resolve(getNextForTable(table))),
						maybeSingle: vi.fn(() => Promise.resolve(getNextForTable(table))),
					}
				}
				// Regular select query - return the chain for further chaining
				return chain
			}),
			eq: vi.fn(() => chain),
			gte: vi.fn(() => chain),
			lte: vi.fn(() => chain),
			in: vi.fn(() => chain),
			or: vi.fn(() => chain),
			order: vi.fn(() => chain),
			limit: vi.fn(() => Promise.resolve(getNextForTable(table))),
			range: vi.fn(() => Promise.resolve(getNextForTable(table))),
			single: vi.fn(() => Promise.resolve(getNextForTable(table))),
			maybeSingle: vi.fn(() => Promise.resolve(getNextForTable(table))),
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
