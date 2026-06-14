import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('migration 219 ystm discovery freshness program v2', () => {
  it('adds lifecycle timestamps, trigger, and latency view', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/219_ystm_discovery_freshness_program_v2.sql'),
      'utf8'
    )
    expect(sql).toContain('first_list_seen_at')
    expect(sql).toContain('first_observed_at')
    expect(sql).toContain('first_ingested_at')
    expect(sql).toContain('first_published_at')
    expect(sql).toContain('ystm_discovery_latency_v1')
    expect(sql).toContain('trg_ystm_coverage_observations_preserve_first_seen')
  })
})
