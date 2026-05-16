import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/178_discovery_state_key_rename.sql'),
  'utf8'
)

describe('migration 178 discovery state key rename', () => {
  it('renames legacy ystm_nationwide to source_discovery_nationwide', () => {
    expect(sql).toContain("'ystm_nationwide'")
    expect(sql).toContain("'source_discovery_nationwide'")
    expect(sql).toContain('UPDATE lootaura_v2.ingestion_discovery_state')
    expect(sql).toContain('SET key = v_new_key')
  })

  it('merges duplicate rows when both keys exist', () => {
    expect(sql).toContain('GREATEST(r_old.state_cursor, r_new.state_cursor)')
    expect(sql).toContain('DELETE FROM lootaura_v2.ingestion_discovery_state WHERE key = v_old_key')
  })

  it('seeds canonical row when neither key exists', () => {
    expect(sql).toContain('INSERT INTO lootaura_v2.ingestion_discovery_state')
    expect(sql).toContain('ON CONFLICT (key) DO NOTHING')
  })

  it('does not reference runtime-only legacy keys beyond ystm_nationwide', () => {
    expect(sql).not.toContain('ystm_discovery')
  })
})
