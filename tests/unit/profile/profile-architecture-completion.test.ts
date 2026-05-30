import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

describe('Profile architecture spec completion guards', () => {
  it('does not auto-deploy DROP public.profiles in supabase/migrations', () => {
    const migrationsDir = join(process.cwd(), 'supabase/migrations')
    const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    const dropLegacy = sqlFiles.filter((file) => {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      return /DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\.profiles/i.test(sql)
    })
    expect(dropLegacy).toEqual([])
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
