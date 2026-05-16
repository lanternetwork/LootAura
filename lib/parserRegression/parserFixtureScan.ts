/**
 * Read parser regression fixtures from disk (`tests/fixtures/parsers/<adapter>/<case>`).
 * Read-only; used by admin diagnostics and aggregate builders.
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  validateParserFixtureMetadataJson,
  type ValidatedParserFixtureMetadata,
} from '@/lib/parserRegression/fixtureFreshness'

export type ScannedParserFixtureRecord = {
  sourceDir: string
  caseId: string
  metadata: ValidatedParserFixtureMetadata
}

export type ScannedParserFixtureError = {
  sourceDir: string
  caseId: string
  errors: string[]
  /** Best-effort hostname from raw JSON when validation failed (for aggregation only). */
  sourceHostHint?: string | null
}

export type ScanParserFixturesResult = {
  ok: ScannedParserFixtureRecord[]
  invalid: ScannedParserFixtureError[]
}

/** Plain hostname only (same shape as validated `source_host`); else null. */
function extractSourceHostHintFromRawMetadata(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const sh = (raw as Record<string, unknown>).source_host
  if (typeof sh !== 'string' || !sh.trim()) return null
  const h = sh.trim().toLowerCase()
  if (h.includes('/') || h.includes('?') || h.includes('#') || h.length > 253) return null
  return h
}

/**
 * Scan `tests/fixtures/parsers/<sourceDir>/<caseId>/metadata.json` under `packageRoot`.
 */
export function scanParserRegressionFixtures(packageRoot: string): ScanParserFixturesResult {
  const base = join(packageRoot, 'tests', 'fixtures', 'parsers')
  if (!existsSync(base)) {
    return { ok: [], invalid: [] }
  }
  const ok: ScannedParserFixtureRecord[] = []
  const invalid: ScannedParserFixtureError[] = []
  const sourceDirs = readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  for (const sourceDir of sourceDirs) {
    const sourcePath = join(base, sourceDir)
    const caseIds = readdirSync(sourcePath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    for (const caseId of caseIds) {
      const metaPath = join(sourcePath, caseId, 'metadata.json')
      if (!existsSync(metaPath)) continue
      let raw: unknown
      try {
        raw = JSON.parse(readFileSync(metaPath, 'utf8')) as unknown
      } catch {
        invalid.push({ sourceDir, caseId, errors: ['metadata.json is not valid JSON'] })
        continue
      }
      const v = validateParserFixtureMetadataJson(raw)
      if (!v.ok) {
        const sourceHostHint = extractSourceHostHintFromRawMetadata(raw)
        invalid.push({ sourceDir, caseId, errors: v.errors, sourceHostHint })
        continue
      }
      ok.push({ sourceDir, caseId, metadata: v.metadata })
    }
  }
  return { ok, invalid }
}
