export function elapsedMs(startMs: number): number {
  return Math.max(0, Math.round(performance.now() - startMs))
}

export async function timeAsync<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now()
  const result = await fn()
  return [result, elapsedMs(start)]
}

export function timeSync<T>(fn: () => T): [T, number] {
  const start = performance.now()
  const result = fn()
  return [result, elapsedMs(start)]
}
