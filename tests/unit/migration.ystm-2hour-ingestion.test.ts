import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 223 ystm list metadata snapshot', () => {
  it('adds snapshot columns and hot index', () => {
    const sql = readFileSync(
      resolve('supabase/migrations/223_ystm_list_metadata_snapshot_v1.sql'),
      'utf8'
    )
    expect(sql).toContain('list_metadata_snapshot')
    expect(sql).toContain('discovery_priority')
    expect(sql).toContain("'hot'")
    expect(sql).toContain("'warm'")
    expect(sql).toContain("'cold'")
  })
})

describe('migration 225 ystm 2hour slo rollup', () => {
  it('creates sla rollup view', () => {
    const sql = readFileSync(
      resolve('supabase/migrations/225_ystm_2hour_slo_rollup_v1.sql'),
      'utf8'
    )
    expect(sql).toContain('ystm_2hour_slo_rollup_v1')
    expect(sql).toContain('p95_publish_hours')
  })
})
