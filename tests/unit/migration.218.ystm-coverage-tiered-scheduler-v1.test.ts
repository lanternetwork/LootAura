import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('migration 218 ystm coverage tiered scheduler v1', () => {
  it('adds tiered scheduler columns, audit run fields, and config events table', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/218_ystm_coverage_tiered_scheduler_v1.sql'),
      'utf8'
    )
    expect(sql).toContain('long_tail_cursor')
    expect(sql).toContain('coverage_tiered_scheduler_enabled')
    expect(sql).toContain('ystm_coverage_audit_config_events')
    expect(sql).toContain('tier1_scheduled')
    expect(sql).toContain('ok_with_observations')
  })
})
