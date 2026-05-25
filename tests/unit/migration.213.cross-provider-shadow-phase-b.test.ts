import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 213 cross-provider shadow phase B', () => {
  it('creates cross_provider_sale_instance_shadow table and indexes', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/213_cross_provider_sale_instance_shadow_phase_b.sql'),
      'utf8'
    )
    expect(sql).toContain('cross_provider_sale_instance_shadow')
    expect(sql).toContain('is_false_negative')
    expect(sql).toContain('disposition')
    expect(sql).toContain('cross_provider_shadow_false_negative_idx')
  })
})
