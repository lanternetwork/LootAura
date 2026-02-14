/**
 * Helper to create a thenable Supabase query chain mock using Proxy
 * 
 * This creates a query object that:
 * - Supports any chained method call (select, eq, in, or, gte, lte, neq, order, range, etc.)
 * - Always returns itself for method chaining
 * - Is thenable (can be awaited) and resolves to a configurable result
 * - Optionally tracks method calls for assertions
 */

export interface QueryResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any
  count?: number | null
}

export interface CallTracker {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calls: Array<{ method: string; args: any[] }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCalls: (method: string) => any[][]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeThenableQuery(
  result: QueryResult = { data: [], error: null, count: 0 },
  tracker?: CallTracker
): any {
  // Create a promise that resolves to the result
  const promise = Promise.resolve(result)

  // Create the proxy handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler: ProxyHandler<any> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(_target: any, prop: string | symbol) {
      const propName = String(prop)

      // Handle Promise methods (then, catch, finally)
      if (propName === 'then') {
        return promise.then.bind(promise)
      }
      if (propName === 'catch') {
        return promise.catch.bind(promise)
      }
      if (propName === 'finally') {
        return promise.finally.bind(promise)
      }

      // For any other property, return a function that:
      // 1. Tracks the call if tracker is provided
      // 2. Returns the same proxy for chaining
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function (...args: any[]) {
        if (tracker) {
          tracker.calls.push({ method: propName, args })
        }
        return makeThenableQuery(result, tracker)
      }
    },
  }

  return new Proxy({}, handler)
}

/**
 * Create a call tracker for asserting method calls
 */
export function createCallTracker(): CallTracker {
  const calls: Array<{ method: string; args: any[] }> = []

  return {
    calls,
    getCalls(method: string) {
      return calls.filter((c) => c.method === method).map((c) => c.args)
    },
  }
}
