import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/182_ingested_sales_geocode_precision_phase_d2.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('ingested_sales geocode precision phase D2 migration', () => {
  it('adds confidence, precision, and method columns', () => {
    expect(sql).toContain('geocode_confidence')
    expect(sql).toContain('coordinate_precision')
    expect(sql).toContain('geocode_method')
  })

  it('blocks locality and city_centroid from publish claim', () => {
    expect(sql).toContain("s.coordinate_precision NOT IN ('locality', 'city_centroid')")
  })
})
