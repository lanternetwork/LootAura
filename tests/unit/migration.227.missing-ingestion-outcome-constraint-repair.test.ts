import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 227 missing ingestion outcome constraint repair v1', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/227_missing_ingestion_outcome_constraint_repair.sql'),
    'utf8'
  )

  it('drops stale inline constraint from migration 197', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS ystm_coverage_observations_missing_ingestion_outcome_check')
    expect(sql).toContain('migration 197')
  })

  it('drops prior _chk constraint before re-adding canonical constraint', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS ystm_coverage_observations_missing_ingestion_outcome_chk')
    expect(sql).toContain('ADD CONSTRAINT ystm_coverage_observations_missing_ingestion_outcome_chk')
  })

  it('allows terminal missing-ingest outcome', () => {
    expect(sql).toContain("'terminal'")
    expect(sql).toContain("'skipped_visible'")
    expect(sql).toContain("'skipped_existing'")
    expect(sql).toContain("'published'")
    expect(sql).toContain("'ingested'")
    expect(sql).toContain("'failed'")
  })
})
