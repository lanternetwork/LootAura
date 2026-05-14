export * from '@/lib/parserRegression/parserFailureTaxonomy'
export * from '@/lib/parserRegression/normalizeExternalPageParseResult'
export * from '@/lib/parserRegression/parserHealth'
export * from '@/lib/parserRegression/fixtureFreshness'
export * from '@/lib/parserRegression/sourceDegradation'
export * from '@/lib/parserRegression/parserFixtureScan'
export * from '@/lib/parserRegression/parserDiagnosticsAggregate'
export {
  parserHealthTransitionFingerprint,
  reportParserHealthTransitions,
  resetParserHealthReporterForTests,
  type ParserSourceEmissionSnapshot,
} from '@/lib/parserRegression/reportParserHealth'
export {
  assertExternalPageFixtureMatches,
  classifyFixtureParseGap,
  emitParserRegressionMismatchTelemetry,
  loadParserFixture,
  parserRegressionPackageRoot,
  runExternalPageSourceFixture,
  type ParserFixtureMetadata,
} from '@/lib/parserRegression/parserRegressionHarness'
