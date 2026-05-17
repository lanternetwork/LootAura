import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/183_ingested_sales_image_enrichment_phase_d2_5.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('ingested_sales image enrichment phase D2.5 migration', () => {
  it('adds image enrichment attempt columns', () => {
    expect(sql).toContain('image_enrichment_attempts')
    expect(sql).toContain('last_image_enrichment_attempt_at')
  })

  it('defines bounded image enrichment claim with skip locked', () => {
    expect(sql).toContain('claim_ingested_sales_for_image_enrichment')
    expect(sql).toContain("address_status = 'address_available'")
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain('image_source_url IS NULL')
  })

  it('extends address enrichment claim with image_source_url', () => {
    expect(sql).toContain('image_source_url text')
    expect(sql).toContain('claimed.image_source_url')
  })
})
