import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/181_ingested_sales_address_lifecycle_phase_d1.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('claim_ingested_sales_for_geocoding migration (D1 address filter)', () => {
  it('requires address_available and non-empty address_raw', () => {
    expect(sql).toContain("s.address_status = 'address_available'")
    expect(sql).toContain('s.address_raw IS NOT NULL')
    expect(sql).toContain("btrim(s.address_raw) <> ''")
  })

  it('prioritizes never-attempted rows before attempted rows', () => {
    expect(sql).toContain('CASE WHEN s.geocode_attempts = 0 THEN 0 ELSE 1 END ASC')
  })

  it('keeps cooldown and attempt eligibility predicates', () => {
    expect(sql).toContain("s.status = 'needs_geocode'")
    expect(sql).toContain('s.geocode_attempts < 3')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
  })
})

describe('claim_ingested_sales_for_address_enrichment migration', () => {
  it('defines enrichment claim with unlock and dedupe partition', () => {
    expect(sql).toContain('claim_ingested_sales_for_address_enrichment')
    expect(sql).toContain('PARTITION BY s.source_platform')
    expect(sql).toContain('s.address_unlock_at <= now()')
    expect(sql).toContain('s.next_enrichment_attempt_at <= now()')
  })
})
