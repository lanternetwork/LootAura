export * from '@/lib/parserRegression/parserFailureTaxonomy'
export * from '@/lib/parserRegression/normalizeExternalPageParseResult'
export {
  assertExternalPageFixtureMatches,
  classifyFixtureParseGap,
  emitParserRegressionMismatchTelemetry,
  loadParserFixture,
  parserRegressionPackageRoot,
  runExternalPageSourceFixture,
  type ParserFixtureMetadata,
} from '@/lib/parserRegression/parserRegressionHarness'
