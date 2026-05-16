import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/173_restrict_upsert_zipcodes_execute_service_role_only.sql'
)
const sql = readFileSync(migrationPath, 'utf8')

describe('migration 173 upsert_zipcodes execute grants', () => {
  it('revokes EXECUTE from PUBLIC, anon, and authenticated', () => {
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) FROM PUBLIC'
    )
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) FROM anon')
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) FROM authenticated'
    )
  })

  it('grants EXECUTE to service_role only (no anon/authenticated grant)', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) TO service_role')
    expect(sql).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.upsert_zipcodes\(jsonb\)\s+TO\s+anon\b/i)
    expect(sql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.upsert_zipcodes\(jsonb\)\s+TO\s+authenticated\b/i
    )
  })
})

describe('admin zip import route embedded upsert_zipcodes DDL', () => {
  const routePath = resolve(process.cwd(), 'app/api/admin/zipcodes/import/route.ts')
  const routeSource = readFileSync(routePath, 'utf8')

  it('matches migration 173 grants when recreating the RPC', () => {
    expect(routeSource).toContain(
      'REVOKE EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) FROM PUBLIC'
    )
    expect(routeSource).toContain('REVOKE EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) FROM anon')
    expect(routeSource).toContain(
      'REVOKE EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) FROM authenticated'
    )
    expect(routeSource).toContain('GRANT EXECUTE ON FUNCTION public.upsert_zipcodes(jsonb) TO service_role')
    expect(routeSource).not.toContain('GRANT EXECUTE ON FUNCTION public.upsert_zipcodes(JSONB) TO authenticated, anon')
  })
})
