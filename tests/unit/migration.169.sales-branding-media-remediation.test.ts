import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/169_sales_remediate_imported_branding_images.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 169 imported sales branding image remediation', () => {
  it('defines branding match + filter helpers and imported-only scope', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION lootaura_v2.url_matches_ingest_branding_asset')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION lootaura_v2.filter_branding_urls_from_sale_media')
    expect(sql).toContain('ingested_sale_id IS NOT NULL')
    expect(sql).toContain('import_source')
    expect(sql).toContain('migration_169_branding_media_remediation')
  })

  it('updates only when cover or images differ after filter (idempotent guard)', () => {
    expect(sql).toContain('IS DISTINCT FROM f.new_cover')
    expect(sql).toContain('IS DISTINCT FROM f.new_images')
  })

  it('references YSTM /pics/ branding path', () => {
    expect(sql).toContain('/pics/')
    expect(sql).toContain('yardsaletreasuremap')
  })
})
