import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 194 ingestion detail-first metrics baseline', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/194_ingestion_detail_first_metrics_baseline.sql'),
    'utf8'
  )

  it('adds baseline column and seed row', () => {
    expect(sql).toContain('detail_first_metrics_baseline_at timestamptz')
    expect(sql).toContain("'detail_first_metrics_baseline'")
    expect(sql).toContain('ingestion_orchestration_state')
  })
})
