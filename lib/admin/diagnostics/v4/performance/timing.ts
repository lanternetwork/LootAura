import { performance } from 'node:perf_hooks'

export function monotonicNow(): number {
  return performance.now()
}

export function elapsedMs(startMs: number): number {
  return Math.max(0, Math.round(monotonicNow() - startMs))
}

export async function timeAsync<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = monotonicNow()
  const result = await fn()
  return [result, elapsedMs(start)]
}

export function timeSync<T>(fn: () => T): [T, number] {
  const start = monotonicNow()
  const result = fn()
  return [result, elapsedMs(start)]
}
