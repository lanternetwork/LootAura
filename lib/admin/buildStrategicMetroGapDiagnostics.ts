import { diagnosticBullet, topRecordEntries } from '@/lib/admin/diagnosticsMarkdown'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

const MAX_METROS = 10
const MAX_STATES = 5

export function buildStrategicMetroGapDiagnostics(
  coverage: YstmCoverageMetricsResponse
): string | null {
  const metros = topRecordEntries(coverage.missingByMetro, MAX_METROS)
  const states = topRecordEntries(coverage.missingByState, MAX_STATES)

  if (metros.length === 0 && states.length === 0) {
    return null
  }

  const lines = ['## STRATEGIC METRO GAPS']

  if (metros.length > 0) {
    lines.push('', '### Top missing metros')
    for (const row of metros) {
      lines.push(diagnosticBullet(row.key, row.count))
    }
  }

  if (states.length > 0) {
    lines.push('', '### Top missing states')
    for (const row of states) {
      lines.push(diagnosticBullet(row.key, row.count))
    }
  }

  return lines.join('\n')
}
