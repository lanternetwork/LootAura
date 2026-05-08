import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/163_claim_geocode_rpc_reduce_starvation_ordering.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('claim_ingested_sales_for_geocoding migration ordering contract', () => {
  it('prioritizes never-attempted rows before attempted rows', () => {
    expect(sql).toContain('CASE WHEN s.geocode_attempts = 0 THEN 0 ELSE 1 END ASC')
  })

  it('orders eligible rows by oldest last_geocode_attempt_at, then updated_at, created_at, id', () => {
    expect(sql).toContain('COALESCE(s.last_geocode_attempt_at, to_timestamp(0)) ASC')
    expect(sql).toContain('s.updated_at ASC')
    expect(sql).toContain('s.created_at ASC')
    expect(sql).toContain('s.id ASC')
  })

  it('keeps cooldown and attempt eligibility predicates for old stuck-row shape', () => {
    expect(sql).toContain("s.status = 'needs_geocode'")
    expect(sql).toContain('s.geocode_attempts < 3')
    expect(sql).toContain('s.last_geocode_attempt_at IS NULL')
    expect(sql).toContain('s.last_geocode_attempt_at < now() - make_interval(mins => p_cooldown_minutes)')
    expect(sql).not.toContain('s.address_raw IS NOT NULL')
    expect(sql).not.toContain('s.normalized_address IS NOT NULL')
  })

  it('keeps bounded batch limit and skip-locked claim behavior', () => {
    expect(sql).toContain('LIMIT GREATEST(COALESCE(p_batch_size, 100), 1)')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
  })
})

