import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/167_sales_duplicate_ingested_sale_id_repair_and_unique.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 167 sales duplicate ingested_sale_id repair + unique index', () => {
  it('defines duplicate detection on non-null ingested_sale_id with HAVING count > 1', () => {
    expect(sql).toContain('lootaura_v2.sales')
    expect(sql).toContain('ingested_sale_id IS NOT NULL')
    expect(sql).toContain('GROUP BY ingested_sale_id')
    expect(sql).toContain('HAVING count(*) > 1')
  })

  it('uses deterministic canonical ranking in a single ROW_NUMBER window ORDER BY', () => {
    expect(sql).toContain('row_number() OVER')
    expect(sql).toContain('PARTITION BY s.ingested_sale_id')
    expect(sql).toContain("WHEN s.status = 'published'")
    expect(sql).toContain('WHEN s.archived_at IS NULL')
    expect(sql).toContain('s.updated_at DESC NULLS LAST')
    expect(sql).toContain('s.created_at DESC NULLS LAST')
    expect(sql).toContain('s.id DESC')
  })

  it('uses data-modifying CTE chain (no temp / persistent helper tables)', () => {
    expect(sql.toLowerCase()).not.toContain('create temp table')
    expect(sql).not.toContain('_m167_sales_dup_rank')
    expect(sql).toContain('WITH dup_keys AS')
    expect(sql).toContain('ranked AS')
    expect(sql).toContain('upd_ingested AS')
    expect(sql).toContain('upd_sales_losers AS')
  })

  it('repairs ingested_sales.published_sale_id to canonical sale before archiving losers', () => {
    expect(sql).toMatch(/UPDATE\s+lootaura_v2\.ingested_sales/i)
    expect(sql).toContain('published_sale_id')
    expect(sql).toContain('WHERE rn = 1')
    expect(sql).toContain('AND r.rn > 1')
  })

  it('archives non-canonical duplicates and clears ingested_sale_id before unique index', () => {
    expect(sql).toMatch(/UPDATE\s+lootaura_v2\.sales\s+s/i)
    expect(sql).toContain("status = 'archived'")
    expect(sql).toContain('archived_at = coalesce(s.archived_at, now())')
    expect(sql).toContain('ingested_sale_id = NULL')
    const ddlIndex =
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_ingested_sale_id_unique'
    expect(sql.lastIndexOf(ddlIndex)).toBeGreaterThan(sql.indexOf('upd_sales_losers'))
  })

  it('creates partial unique index idx_sales_ingested_sale_id_unique', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_ingested_sale_id_unique')
    expect(sql).toContain('ON lootaura_v2.sales (ingested_sale_id)')
    expect(sql).toContain('WHERE ingested_sale_id IS NOT NULL')
  })

  it('documents FK-safe strategy without blind DELETE of duplicate sales', () => {
    expect(sql).toContain('no blind DELETE')
    expect(sql).not.toMatch(/DELETE\s+FROM\s+lootaura_v2\.sales/i)
  })

  it('does not DROP any index (non-unique idx_sales_ingested_sale_id unchanged by omission)', () => {
    expect(sql.toLowerCase()).not.toContain('drop index')
  })

  it('emits structured NOTICE diagnostics for duplicate groups and index step', () => {
    expect(sql).toContain('RAISE NOTICE')
    expect(sql).toContain('migration_167_sales_ingested_dup_repair')
    expect(sql).toContain('duplicate_nonnull_groups_before')
    expect(sql).toContain('published_sale_id_repairs')
    expect(sql).toContain('sales_rows_archived')
    expect(sql).toContain('idx_sales_ingested_sale_id_unique')
  })
})
