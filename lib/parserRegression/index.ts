export * from '@/lib/parserRegression/parserFailureTaxonomy'
export * from '@/lib/parserRegression/normalizeExternalPageParseResult'
export * from '@/lib/parserRegression/parserHealth'
export * from '@/lib/parserRegression/fixtureFreshness'
export * from '@/lib/parserRegression/sourceDegradation'
export {
  buildParserDiagnosticsFromFixtures,
  type ParserDiagnosticsFixtureSample,
  type ParserDiagnosticsSnapshot,
  type ParserDiagnosticsSourceEntry,
} from '@/lib/parserRegression/buildParserDiagnostics'
export { reportParserHealthTransition, resetParserHealthReporterForTests } from '@/lib/parserRegression/reportParserHealth'
export {
  assertExternalPageFixtureMatches,
  classifyFixtureParseGap,
  emitParserRegressionMismatchTelemetry,
  loadParserFixture,
  parserRegressionPackageRoot,
  runExternalPageSourceFixture,
  type ParserFixtureMetadata,
} from '@/lib/parserRegression/parserRegressionHarness'
