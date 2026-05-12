/**
 * Tier 0 parser regression failure categories (fixture/CI only).
 * Used to classify gaps between expected extraction and actual parse outcomes.
 */

export const ParserRegressionFailureKind = {
  selector_missing: 'selector_missing',
  malformed_source_data: 'malformed_source_data',
  extraction_empty: 'extraction_empty',
  normalization_failed: 'normalization_failed',
  unsupported_layout: 'unsupported_layout',
} as const

export type ParserRegressionFailureKind =
  (typeof ParserRegressionFailureKind)[keyof typeof ParserRegressionFailureKind]

const LISTING_HREF_RE = /href\s*=\s*["'][^"']*\/(?:listing|userlisting)\.html/i

/** True when HTML appears to contain a YSTM-style listing anchor target. */
export function htmlContainsExternalPageListingHref(html: string): boolean {
  return LISTING_HREF_RE.test(html)
}

/**
 * Classifies an empty or failed external-page parse against fixture HTML.
 * Returns null when listings were extracted (no regression gap at listing level).
 */
export function classifyExternalPageSourceRegressionGap(
  html: string,
  result: { listings: readonly unknown[]; invalid: number },
  options?: { stateResolved: boolean }
): ParserRegressionFailureKind | null {
  if (result.listings.length > 0) return null
  if (options?.stateResolved === false) return ParserRegressionFailureKind.unsupported_layout
  if (result.invalid > 0) return ParserRegressionFailureKind.malformed_source_data
  if (!htmlContainsExternalPageListingHref(html)) {
    return ParserRegressionFailureKind.selector_missing
  }
  return ParserRegressionFailureKind.extraction_empty
}
