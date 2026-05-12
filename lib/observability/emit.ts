import type { ObservabilityEventName } from './events'

export type TelemetryRecord = {
  event: ObservabilityEventName
  [key: string]: unknown
}

/** Drops undefined values and ensures `event` is first-class for stable aggregations. */
export function buildTelemetryRecord(
  event: ObservabilityEventName,
  fields: Record<string, unknown> = {}
): TelemetryRecord {
  const out: Record<string, unknown> = { event }
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) out[k] = v
  }
  return out as TelemetryRecord
}

/**
 * When true, one JSON line per telemetry record is written to stdout for log drains (Vercel, etc.).
 * In production default is off unless LOG_TELEMETRY_JSON=1.
 */
export function shouldEmitTelemetryJson(): boolean {
  if (process.env.NODE_ENV === 'test') return false
  if (process.env.LOG_TELEMETRY_JSON === '1') return true
  if (process.env.NODE_ENV !== 'production') return true
  return false
}

/** Single-line JSON for aggregators. Callers must avoid PII (no raw URLs with query tokens, no emails). */
export function emitObservabilityRecord(record: TelemetryRecord): void {
  if (!shouldEmitTelemetryJson()) return
  try {
    const line = JSON.stringify({
      t: new Date().toISOString(),
      ...record,
    })
    process.stdout.write(`${line}\n`)
  } catch {
    // Never throw from telemetry
  }
}
