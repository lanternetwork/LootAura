/**
 * Aggregate parser diagnostics from on-disk regression fixtures (bounded scan).
 * Does not expose raw HTML; uses validated metadata + parse outcomes only.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { parseExternalPageSourceHtml } from '@/lib/ingestion/adapters/externalPageSource'
import type { ExternalPageSourceIngestionConfig } from '@/lib/ingestion/adapters/externalPageSource'
import { resolveUsListStatePathSegment } from '@/lib/ingestion/adapters/usStateListPathSegment'
import {
  defaultFixtureFreshnessThresholds,
  evaluateFixtureFreshness,
  fixtureFreshnessFromValidationFailure,
  validateParserFixtureMetadata,
} from '@/lib/parserRegression/fixtureFreshness'
import {
  classifyParserHealthFromCounts,
  defaultParserHealthThresholds,
  type ParserHealthCounts,
} from '@/lib/parserRegression/parserHealth'
import { normalizeExternalPageParseResult } from '@/lib/parserRegression/normalizeExternalPageParseResult'
import {
  classifyExternalPageSourceRegressionGap,
} from '@/lib/parserRegression/parserFailureTaxonomy'
import { buildSourceDegradationRow, summarizeSourceDegradation } from '@/lib/parserRegression/sourceDegradation'
import type { FixtureFreshnessReason, FixtureFreshnessStatus } from '@/lib/parserRegression/fixtureFreshness'
import type { ParserHealthReason, ParserHealthStatus } from '@/lib/parserRegression/parserHealth'

export type ParserDiagnosticsFixtureSample = {
  sourceDir: string
  caseId: string
  mismatch: boolean
  parseDurationMs: number
  listingsCount: number
}

export type ParserDiagnosticsSourceEntry = {
  sourceHost: string
  healthStatus: ParserHealthStatus
  freshnessStatus: FixtureFreshnessStatus
  score: number
  healthReasons: ParserHealthReason[]
  freshnessReasons: FixtureFreshnessReason[]
  degradationTags: SourceDegradationTag[]
  recommendedAction: string
  fixtureTotal: number
  staleFixtureCount: number
  agingFixtureCount: number
  freshFixtureCount: number
  fixtureMismatchCount: number
  zeroListingCount: number
  samples: ParserDiagnosticsFixtureSample[]
}

export type ParserDiagnosticsSnapshot = {
  sources: ParserDiagnosticsSourceEntry[]
  summary: {
    healthy: number
    degraded: number
    failing: number
  }
  degradedSources: string[]
  failingSources: string[]
  recommendedAction: string
}

type HostAgg = {
  sourceHost: string
  counts: ParserHealthCounts
  staleN: number
  agingN: number
  freshN: number
  samples: ParserDiagnosticsFixtureSample[]
}

function emptyCounts(): ParserHealthCounts {
  return {
    total: 0,
    fixtureMismatch: 0,
    zeroListings: 0,
    selectorMissing: 0,
    malformedSourceData: 0,
    unsupportedLayout: 0,
    extractionEmpty: 0,
    normalizationFailed: 0,
    parseDurationSumMs: 0,
    parseDurationMaxMs: 0,
    duplicateSuppressed: 0,
    duplicateSuppressedExpected: 0,
  }
}

function processFixtureFile(
  sourceDir: string,
  caseId: string,
  baseDir: string,
  nowMs: number,
  hostAggs: Map<string, HostAgg>
): void {
  const metaPath = join(baseDir, 'metadata.json')
  const rawPath = join(baseDir, 'raw.html')
  const expectedPath = join(baseDir, 'expected.json')
  if (!existsSync(metaPath) || !existsSync(rawPath) || !existsSync(expectedPath)) return

  const rawMeta = JSON.parse(readFileSync(metaPath, 'utf8')) as unknown
  const validated = validateParserFixtureMetadata(rawMeta)
  const rawHtml = readFileSync(rawPath, 'utf8')
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as unknown

  let sourceHost: string
  let freshness: { status: FixtureFreshnessStatus; reasons: FixtureFreshnessReason[] }
  if (!validated.ok) {
    sourceHost = '__invalid_metadata__'
    const fr = fixtureFreshnessFromValidationFailure(validated.error)
    freshness = { status: fr.status, reasons: fr.reasons }
  } else {
    sourceHost = validated.metadata.sourceHost
    freshness = evaluateFixtureFreshness(
      validated.metadata.capturedAtMs,
      nowMs,
      defaultFixtureFreshnessThresholds()
    )
  }

  let agg = hostAggs.get(sourceHost)
  if (!agg) {
    agg = {
      sourceHost,
      counts: emptyCounts(),
      staleN: 0,
      agingN: 0,
      freshN: 0,
      samples: [],
    }
    hostAggs.set(sourceHost, agg)
  }

  agg.counts.total += 1
  if (freshness.status === 'stale') agg.staleN += 1
  else if (freshness.status === 'aging') agg.agingN += 1
  else agg.freshN += 1

  if (!validated.ok) {
    agg.counts.normalizationFailed += 1
    agg.samples.push({
      sourceDir,
      caseId,
      mismatch: true,
      parseDurationMs: 0,
      listingsCount: 0,
    })
    return
  }

  const meta = validated.metadata
  const config = meta.config as unknown as ExternalPageSourceIngestionConfig
  const t0 = Date.now()
  const parsed = parseExternalPageSourceHtml(rawHtml, config, meta.pageUrl)
  const parseDurationMs = Math.max(0, Date.now() - t0)
  agg.counts.parseDurationSumMs += parseDurationMs
  agg.counts.parseDurationMaxMs = Math.max(agg.counts.parseDurationMaxMs, parseDurationMs)

  let actual: Record<string, unknown>
  try {
    actual = normalizeExternalPageParseResult(parsed) as Record<string, unknown>
  } catch {
    agg.counts.normalizationFailed += 1
    agg.samples.push({ sourceDir, caseId, mismatch: true, parseDurationMs, listingsCount: 0 })
    return
  }

  const listings = Array.isArray(actual.listings) ? actual.listings : []
  if (listings.length === 0) {
    agg.counts.zeroListings += 1
  }

  const expectedStr = typeof expected === 'object' && expected !== null ? JSON.stringify(expected) : ''
  const actualStr = JSON.stringify(actual)
  const mismatch = expectedStr.length === 0 || actualStr !== expectedStr
  if (mismatch) {
    agg.counts.fixtureMismatch += 1
  }

  const stateSeg = resolveUsListStatePathSegment(config.state)
  const gap = classifyExternalPageSourceRegressionGap(rawHtml, parsed, {
    stateResolved: Boolean(stateSeg),
  })
  if (gap === 'selector_missing') agg.counts.selectorMissing += 1
  else if (gap === 'malformed_source_data') agg.counts.malformedSourceData += 1
  else if (gap === 'unsupported_layout') agg.counts.unsupportedLayout += 1
  else if (gap === 'extraction_empty') agg.counts.extractionEmpty += 1

  agg.samples.push({
    sourceDir,
    caseId,
    mismatch,
    parseDurationMs,
    listingsCount: listings.length,
  })
}

/**
 * Walk `tests/fixtures/parsers/<adapter>/<case>/` and aggregate diagnostics by `source_host`.
 */
export function buildParserDiagnosticsFromFixtures(packageRoot: string, nowMs: number): ParserDiagnosticsSnapshot {
  const fixturesRoot = join(packageRoot, 'tests', 'fixtures', 'parsers')
  if (!existsSync(fixturesRoot)) {
    return {
      sources: [],
      summary: { healthy: 0, degraded: 0, failing: 0 },
      degradedSources: [],
      failingSources: [],
      recommendedAction: 'no_fixtures_root',
    }
  }

  const hostAggs = new Map<string, HostAgg>()
  for (const sourceDir of readdirSync(fixturesRoot)) {
    const adapterPath = join(fixturesRoot, sourceDir)
    if (!statSync(adapterPath).isDirectory()) continue
    for (const caseId of readdirSync(adapterPath)) {
      const casePath = join(adapterPath, caseId)
      if (!statSync(casePath).isDirectory()) continue
      processFixtureFile(sourceDir, caseId, casePath, nowMs, hostAggs)
    }
  }

  const thresholds = defaultParserHealthThresholds()
  const sources: ParserDiagnosticsSourceEntry[] = []
  let healthy = 0
  let degraded = 0
  let failing = 0

  for (const agg of hostAggs.values()) {
    const health = classifyParserHealthFromCounts(agg.counts, thresholds)
    const worstFresh: FixtureFreshnessStatus =
      agg.staleN > 0 ? 'stale' : agg.agingN > 0 ? 'aging' : 'fresh'
    const freshnessReasons: FixtureFreshnessReason[] = []
    if (agg.staleN > 0) freshnessReasons.push('fixture_age_stale')
    if (agg.agingN > 0) freshnessReasons.push('fixture_age_aging')

    const row = buildSourceDegradationRow({
      sourceHost: agg.sourceHost,
      health: health,
      freshnessStatus: worstFresh,
      freshnessReasons,
      counts: agg.counts,
    })

    sources.push({
      sourceHost: agg.sourceHost,
      healthStatus: health.status,
      freshnessStatus: worstFresh,
      score: health.score,
      healthReasons: health.reasons,
      freshnessReasons,
      degradationTags: row.tags,
      recommendedAction: row.recommendedAction,
      fixtureTotal: agg.counts.total,
      staleFixtureCount: agg.staleN,
      agingFixtureCount: agg.agingN,
      freshFixtureCount: agg.freshN,
      fixtureMismatchCount: agg.counts.fixtureMismatch,
      zeroListingCount: agg.counts.zeroListings,
      samples: agg.samples.slice(0, 5),
    })

    const combined =
      health.status === 'failing' || worstFresh === 'stale'
        ? 'failing'
        : health.status === 'degraded' || worstFresh === 'aging'
          ? 'degraded'
          : 'healthy'
    if (combined === 'healthy') healthy += 1
    else if (combined === 'degraded') degraded += 1
    else failing += 1
  }

  sources.sort((a, b) => a.sourceHost.localeCompare(b.sourceHost))

  const { degradedSources, failingSources, recommendedAction } = summarizeSourceDegradation(
    sources.map((s) => ({
      sourceHost: s.sourceHost,
      healthStatus: s.healthStatus,
      freshnessStatus: s.freshnessStatus,
      tags: s.degradationTags,
      recommendedAction: s.recommendedAction,
    }))
  )

  return {
    sources,
    summary: { healthy, degraded, failing },
    degradedSources,
    failingSources,
    recommendedAction,
  }
}
