import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 221 missing ingest fetch failed recovery v1', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/221_missing_ingest_fetch_failed_recovery_v1.sql'),
    'utf8'
  )

  it('adds replay columns and terminal missing-ingest outcome', () => {
    expect(sql).toContain('missing_ingestion_replay_count')
    expect(sql).toContain('missing_ingestion_last_retry_at')
    expect(sql).toContain("'terminal'")
  })

  it('indexes fetch_failed retry queue', () => {
    expect(sql).toContain('ystm_coverage_observations_fetch_failed_retry_idx')
    expect(sql).toContain("missing_ingestion_failure_reason = 'fetch_failed'")
  })
})
