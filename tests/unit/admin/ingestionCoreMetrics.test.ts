import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('buildIngestionCoreMetricsResponse', () => {
  it('skips expensive diagnostics by default in metrics route', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/admin/ingestion/metrics/route.ts'),
      'utf8'
    )
    expect(source).toContain('includeExpensiveDiagnostics')
    expect(source).toContain('buildIngestionCoreMetricsResponse')
    expect(source).toContain('Promise.resolve([] as FunnelCohortRow[])')
    expect(source).toContain('countGeocodeDeadLetterReplayBuckets')
  })

  it('GET handler uses core metrics only', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/admin/ingestion/metrics/route.ts'),
      'utf8'
    )
    expect(source).toContain('buildIngestionCoreMetricsResponse()')
    expect(source).not.toMatch(/GET[\s\S]*buildIngestionFullMetricsResponse/)
  })
})
