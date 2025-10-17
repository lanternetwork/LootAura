// Test utilities for deterministic async testing
// These helpers are not included in the runtime bundle

export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

/**
 * Create a deferred promise that can be resolved/rejected externally
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void
  let reject: (error: Error) => void
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  
  return {
    promise,
    resolve: resolve!,
    reject: reject!
  }
}

/**
 * Flush microtasks to ensure all Promise.then() callbacks are executed
 */
export async function flushMicrotasks(): Promise<void> {
  // Double Promise.resolve() to ensure all microtasks are flushed
  await Promise.resolve()
  await Promise.resolve()
}
