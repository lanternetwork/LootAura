import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/176_ingestion_city_configs_source_discovery.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 176 ingestion_city_configs source discovery', () => {
  it('adds discovery status columns', () => {
    expect(sql).toContain('source_discovery_status')
    expect(sql).toContain('source_last_discovered_at')
    expect(sql).toContain('source_last_validated_at')
    expect(sql).toContain('source_last_failed_at')
    expect(sql).toContain('source_discovery_failure_reason')
  })

  it('backfills manual for rows with https source_pages and pending otherwise', () => {
    expect(sql).toContain("THEN 'manual'")
    expect(sql).toContain("ELSE 'pending'")
    expect(sql).toContain("url ~* '^https://'")
  })

  it('constrains allowed status values', () => {
    expect(sql).toContain("'pending'")
    expect(sql).toContain("'discovered'")
    expect(sql).toContain("'validated'")
    expect(sql).toContain("'failed'")
    expect(sql).toContain("'manual'")
    expect(sql).toContain('ingestion_city_configs_source_discovery_status_chk')
  })

  it('does not disable or delete configs', () => {
    expect(sql).not.toMatch(/enabled\s*=\s*false/i)
    expect(sql).not.toMatch(/DELETE FROM/i)
  })
})
