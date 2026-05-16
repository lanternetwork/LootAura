import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CRITICAL_INDEX_NAMES } from '@/lib/admin/ingestionIntegrity'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/168_ingestion_integrity_report_rpc.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 168 ingestion_integrity_report RPC', () => {
  it('defines read-only STABLE ingestion_integrity_report returning jsonb', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION lootaura_v2.ingestion_integrity_report()')
    expect(sql).toContain('RETURNS jsonb')
    expect(sql).toContain('LANGUAGE sql')
    expect(sql).toContain('STABLE')
    expect(sql).toContain('SECURITY INVOKER')
  })

  it('includes duplicate ingested_sale_id, orphan, and duplicate URL checks', () => {
    expect(sql).toContain('GROUP BY ingested_sale_id')
    expect(sql).toContain('HAVING count(*) > 1')
    expect(sql).toContain('published_sale_id IS NOT NULL')
    expect(sql).toContain('ingested_sale_id IS NOT NULL')
    expect(sql).toContain("status = 'published'")
    expect(sql).toContain('import_source IS NOT NULL OR ingested_sale_id IS NOT NULL')
  })

  it('matches CRITICAL_INDEX_NAMES allowlist from lib/admin/ingestionIntegrity.ts', () => {
    for (const name of CRITICAL_INDEX_NAMES) {
      expect(sql).toContain(`'${name}'`)
    }
    expect(sql).toContain('pg_catalog.pg_indexes')
    expect(sql).toContain("schemaname = 'lootaura_v2'")
  })

  it('locks down execute to service_role only', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION lootaura_v2.ingestion_integrity_report()')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION lootaura_v2.ingestion_integrity_report() TO service_role')
  })
})
