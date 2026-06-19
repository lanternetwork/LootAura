import type { Ystm2HourIngestionDiagnostics } from '@/lib/admin/loadYstm2HourIngestionDiagnostics'

export function minimalYstm2HourIngestionDiagnostics(
  overrides: Partial<Ystm2HourIngestionDiagnostics> = {}
): Ystm2HourIngestionDiagnostics {
  return {
    p50PublishHours: null,
    p95PublishHours: null,
    hotQueueDepth: 0,
    coldQueueDepth: 0,
    warmQueueDepth: 0,
    over2hCount: 0,
    oldestHotAgeHours: null,
    salePhpUnsupportedCount: 0,
    listFastPublishSuccessCount: 0,
    listFastPublishFailureCount: 0,
    slaWithin2hPct: null,
    ...overrides,
  }
}
