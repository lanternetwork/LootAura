import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 214 cross_provider_convergence_slo_phase_e', () => {
  it('creates cross_provider_convergence_slo_daily table', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/214_cross_provider_convergence_slo_phase_e.sql'),
      'utf8'
    )
    expect(sql).toContain('cross_provider_convergence_slo_daily')
    expect(sql).toContain('duplicate_published_canonical_clusters')
    expect(sql).toContain('slo_date date PRIMARY KEY')
  })
})
