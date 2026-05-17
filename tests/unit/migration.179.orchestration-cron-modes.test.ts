import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/179_ingestion_orchestration_runs_discovery_reconciliation_modes.sql'),
  'utf8'
)

describe('migration 179 orchestration cron modes', () => {
  it('allows discovery_cron and reconciliation_cron modes', () => {
    expect(sql).toContain("'discovery_cron'")
    expect(sql).toContain("'reconciliation_cron'")
    expect(sql).toContain('ingestion_orchestration_runs_mode_check')
  })
})
