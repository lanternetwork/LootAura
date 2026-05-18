import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/190_ingestion_native_coordinate_remediation_phase_2b.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('claim_ingested_sales_for_native_coordinate_remediation (Phase 2B)', () => {
  it('is service_role only with explicit search_path', () => {
    expect(sql).toContain('claim_ingested_sales_for_native_coordinate_remediation')
    expect(sql).toContain('SET search_path = lootaura_v2, pg_catalog')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_native_coordinate_remediation')
    expect(sql).toContain('TO service_role')
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION lootaura_v2.claim_ingested_sales_for_native_coordinate_remediation')
    expect(sql).toContain('FROM anon')
    expect(sql).toContain('FROM authenticated')
  })

  it('uses SKIP LOCKED with bounded batch and attempt limits', () => {
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain('native_coord_attempts < GREATEST(COALESCE(p_max_attempts, 5), 1)')
    expect(sql).toContain('LIMIT GREATEST(COALESCE(p_batch_size, 75), 1)')
  })

  it('claims needs_geocode and narrowly eligible needs_check only', () => {
    expect(sql).toContain("s.status = 'needs_geocode'")
    expect(sql).toContain("s.status = 'needs_check'")
    expect(sql).toContain('is_native_coord_needs_check_eligible')
    expect(sql).toContain("'transient_provider'")
  })

  it('requires YSTM detail external rows with publishable address gate', () => {
    expect(sql).toContain("s.source_platform = 'external_page_source'")
    expect(sql).toContain('is_ystm_detail_listing_url')
    expect(sql).toContain("s.address_status = 'address_available'")
    expect(sql).toContain('btrim(s.address_raw) <>')
    expect(sql).toContain('s.lat IS NULL')
    expect(sql).toContain('s.published_sale_id IS NULL')
  })

  it('honors cooldown and excludes terminal native failures', () => {
    expect(sql).toContain('native_coord_next_attempt_at <= now()')
    expect(sql).toContain("native_coord_failure_reason NOT LIKE 'terminal_%'")
  })
})

describe('claim_ingested_sales_for_geocoding YSTM native guard (Phase 2B)', () => {
  it('defers YSTM detail rows until native remediation is exhausted', () => {
    expect(sql).toContain('claim_ingested_sales_for_geocoding')
    expect(sql).toContain('native_coord_failure_reason LIKE \'terminal_%\'')
    expect(sql).toContain('COALESCE(s.native_coord_attempts, 0) >= 5')
    expect(sql).toContain('is_ystm_detail_listing_url(s.source_url)')
  })
})
