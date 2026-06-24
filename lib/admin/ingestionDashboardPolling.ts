/** Core ingestion counters — max once per minute per open dashboard tab. */
export const INGESTION_CORE_METRICS_POLL_MS = 60_000

/** Expensive diagnostics — manual refresh or slow background interval. */
export const INGESTION_DIAGNOSTICS_POLL_MS = 5 * 60_000
