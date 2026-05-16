import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Phase 1B guard: reconciliation must not write public `sales` from `reconcileExternalSources`.
 * Candidate discovery uses SQL RPC + ingested_sales updates only.
 */
describe('reconcileExternalSources (static)', () => {
  it('does not call fromBase(admin, sales) — linked candidates come from reconciliation_candidate_rows_page RPC', () => {
    const path = join(process.cwd(), 'lib/reconciliation/reconcileExternalSources.ts')
    const src = readFileSync(path, 'utf8')
    expect(src).not.toMatch(/fromBase\(admin, ['"]sales['"]\)/)
  })

  it('defaults omitted dryRun to read-only persistence (library safety)', () => {
    const path = join(process.cwd(), 'lib/reconciliation/reconcileExternalSources.ts')
    const src = readFileSync(path, 'utf8')
    expect(src).toMatch(/const\s+dryRun\s*=\s*options\?\.dryRun\s*!==\s*false/)
  })
})
