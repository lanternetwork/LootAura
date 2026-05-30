import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

describe('Profile architecture spec completion guards', () => {
  it('only migration 217 may drop public.profiles', () => {
    const migrationsDir = join(process.cwd(), 'supabase/migrations')
    const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    const dropLegacy = sqlFiles.filter((file) => {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      return /DROP\s+TABLE\s+.*public\.profiles/i.test(sql)
    })
    expect(dropLegacy).toEqual(['217_drop_legacy_public_profiles.sql'])
  })

  it('Phase 8 drop script fails closed when only_public remains', () => {
    const sql = readFileSync(
      join(process.cwd(), 'scripts/audit/profile-drop-legacy-public-profiles.sql'),
      'utf8'
    )
    expect(sql).toContain('only_public')
    expect(sql).toContain('RAISE EXCEPTION')
    expect(sql).toContain('DROP TABLE IF EXISTS public.profiles')
  })

  it('T table constant no longer exposes legacy profiles name', () => {
    const source = readFileSync(join(process.cwd(), 'lib/supabase/tables.ts'), 'utf8')
    expect(source).not.toMatch(/profiles:\s*['"]profiles['"]/)
  })
})
