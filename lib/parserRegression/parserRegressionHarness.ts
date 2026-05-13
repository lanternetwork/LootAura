import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  parseExternalPageSourceHtml,
  type ExternalPageSourceIngestionConfig,
} from '@/lib/ingestion/adapters/externalPageSource'
import { resolveUsListStatePathSegment } from '@/lib/ingestion/adapters/usStateListPathSegment'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'
import { normalizeExternalPageParseResult } from '@/lib/parserRegression/normalizeExternalPageParseResult'
import {
  classifyExternalPageSourceRegressionGap,
  type ParserRegressionFailureKind,
} from '@/lib/parserRegression/parserFailureTaxonomy'
import { validateParserFixtureMetadata } from '@/lib/parserRegression/fixtureFreshness'

/**
 * Repo package root (directory containing `tests/fixtures/parsers`).
 * Uses `process.cwd()` so Vitest’s bundled execution (where `import.meta.url` may not be a `file:` URL) still resolves fixtures in CI.
 */
export function parserRegressionPackageRoot(): string {
  return process.cwd()
}

export type ParserFixtureMetadata = {
  pageUrl: string
  config: ExternalPageSourceIngestionConfig
  /** ISO 8601 capture timestamp (required). */
  captured_at: string
  /** Normalized hostname for diagnostics aggregation (required). */
  source_host: string
  parser_version?: string
  source_type?: string
}

export function loadParserFixture(
  sourceDir: string,
  caseId: string
): { rawHtml: string; expected: unknown; metadata: ParserFixtureMetadata } {
  const base = join(parserRegressionPackageRoot(), 'tests', 'fixtures', 'parsers', sourceDir, caseId)
  const rawPath = join(base, 'raw.html')
  const expectedPath = join(base, 'expected.json')
  const metaPath = join(base, 'metadata.json')
  if (!existsSync(rawPath)) throw new Error(`Missing fixture raw: ${rawPath}`)
  if (!existsSync(expectedPath)) throw new Error(`Missing fixture expected: ${expectedPath}`)
  if (!existsSync(metaPath)) throw new Error(`Missing fixture metadata: ${metaPath}`)
  const rawHtml = readFileSync(rawPath, 'utf8')
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as unknown
  const rawMeta = JSON.parse(readFileSync(metaPath, 'utf8')) as unknown
  const validated = validateParserFixtureMetadata(rawMeta)
  if (!validated.ok) {
    throw new Error(`Invalid fixture metadata (${sourceDir}/${caseId}): ${validated.error}`)
  }
  const m = validated.metadata
  const ro = rawMeta as Record<string, unknown>
  const metadata: ParserFixtureMetadata = {
    pageUrl: m.pageUrl,
    config: m.config as unknown as ExternalPageSourceIngestionConfig,
    captured_at: String(ro.captured_at ?? '').trim(),
    source_host: m.sourceHost,
    ...(typeof ro.parser_version === 'string' && ro.parser_version.trim()
      ? { parser_version: ro.parser_version.trim() }
      : {}),
    ...(typeof ro.source_type === 'string' && ro.source_type.trim()
      ? { source_type: ro.source_type.trim() }
      : {}),
  }
  return { rawHtml, expected, metadata }
}

export function runExternalPageSourceFixture(sourceDir: string, caseId: string): {
  actual: Record<string, unknown>
  expected: Record<string, unknown>
  metadata: ParserFixtureMetadata
} {
  const { rawHtml, expected, metadata } = loadParserFixture(sourceDir, caseId)
  const parsed = parseExternalPageSourceHtml(rawHtml, metadata.config, metadata.pageUrl)
  const actual = normalizeExternalPageParseResult(parsed)
  if (typeof expected !== 'object' || expected === null) {
    throw new Error('expected.json must be a JSON object')
  }
  return { actual, expected: expected as Record<string, unknown>, metadata }
}

export function emitParserRegressionMismatchTelemetry(fields: {
  sourceDir: string
  caseId: string
  category: ParserRegressionFailureKind | 'fixture_mismatch'
}): void {
  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.parser.regressionMismatch, {
      sourceDir: fields.sourceDir,
      caseId: fields.caseId,
      category: fields.category,
    })
  )
}

/**
 * Strict fixture pass: normalized actual must deep-equal normalized expected shape.
 * On mismatch, emits at most one structured telemetry line when telemetry JSON is enabled (never in vitest test env).
 */
export function assertExternalPageFixtureMatches(sourceDir: string, caseId: string): void {
  const { actual, expected } = runExternalPageSourceFixture(sourceDir, caseId)
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    emitParserRegressionMismatchTelemetry({ sourceDir, caseId, category: 'fixture_mismatch' })
    throw new Error(
      `Parser fixture mismatch ${sourceDir}/${caseId}\n--- expected ---\n${e}\n--- actual ---\n${a}`
    )
  }
}

export function classifyFixtureParseGap(
  sourceDir: string,
  caseId: string
): ParserRegressionFailureKind | null {
  const { rawHtml, metadata } = loadParserFixture(sourceDir, caseId)
  const parsed = parseExternalPageSourceHtml(rawHtml, metadata.config, metadata.pageUrl)
  const stateSeg = resolveUsListStatePathSegment(metadata.config.state)
  return classifyExternalPageSourceRegressionGap(rawHtml, parsed, {
    stateResolved: Boolean(stateSeg),
  })
}
