/** Export envelope version (markdown reports). */
export const DIAGNOSTICS_EXPORT_VERSION = '4.1.0'

/** Diagnostics model schema version (JSON + computed fields). */
export const DIAGNOSTICS_MODEL_VERSION = '4.1.0'

export const COVERAGE_SLO_MIN_PCT = 90
export const CATALOG_REPAIR_SLO_MAX = 100
export const ACTIONABLE_MISSING_SLO_MAX = 50
export const PUBLISH_FAILED_SLO_MAX = 50
export const CANONICAL_KEY_COVERAGE_MIN_PCT = 95
export const PARSER_SUCCESS_MIN_RATE = 0.9
export const DUPLICATE_CONVERGENCE_STREAK_TARGET_DAYS = 14
export const VISIBLE_DUPLICATE_RATE_MAX = 0.005

/** Queue at/above SLO and flat/up over prior snapshot proxy (24h funnel context). */
export const INSUFFICIENT_DRAIN_QUEUE_MIN = 50

/** Refresh stale backlog considered elevated for degraded health. */
export const REFRESH_STALE_ELEVATED_MIN = 1_000

/** Aged hot-path queue thresholds (ms). */
export const HOT_PATH_QUEUE_MIN = 50
export const HOT_PATH_OLDEST_AGE_MS = 30 * 60 * 1000

/** Severe visibility failure thresholds (HIGH / full-population confidence only). */
export const SEVERE_VISIBILITY_FAILURE_MIN_COUNT = 25
export const SEVERE_VISIBILITY_FAILURE_MIN_RATE = 0.01

/** Sample audit must cover full bucket to be HIGH confidence. */
export const VISIBILITY_SAMPLE_HIGH_COVERAGE_PCT = 95
