import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('migration 180 ingestion lane state', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/180_ingestion_orchestration_lane_state.sql'),
    'utf8'
  )

  it('seeds per-lane orchestration state keys', () => {
    expect(sql).toContain('external_page_source:global')
    expect(sql).toContain('external_page_source:region:midwest')
    expect(sql).toContain('ingestion_lane_rotation')
    expect(sql).toContain('ON CONFLICT (key) DO NOTHING')
  })
})
