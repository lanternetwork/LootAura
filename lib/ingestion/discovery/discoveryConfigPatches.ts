import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'

/** Merge validated HTTPS list URLs without dropping existing crawl pages. */
export function mergeHttpsSourcePages(existing: unknown, ...additions: string[]): string[] {
  const pages = normalizeSourcePages(existing)
  const set = new Set(pages)
  for (const raw of additions) {
    const u = raw.trim()
    if (!u) continue
    try {
      const parsed = new URL(u)
      if (parsed.protocol === 'https:') set.add(parsed.toString())
    } catch {
      if (/^https:\/\//i.test(u)) set.add(u)
    }
  }
  return [...set].sort()
}

export function buildValidatedSourcePagesPatch(
  now: string,
  canonicalUrl: string,
  existingPages?: unknown
) {
  return {
    source_pages: mergeHttpsSourcePages(existingPages, canonicalUrl),
    source_discovery_status: SOURCE_DISCOVERY_STATUS.validated,
    source_last_discovered_at: now,
    source_last_validated_at: now,
    source_last_failed_at: null,
    source_discovery_failure_reason: null,
  }
}

export function buildRevalidatedTimestampsPatch(now: string) {
  return {
    source_discovery_status: SOURCE_DISCOVERY_STATUS.validated,
    source_last_validated_at: now,
    source_last_failed_at: null,
    source_discovery_failure_reason: null,
  }
}

export function buildFailedDiscoveryPatch(now: string, reason: string) {
  return {
    source_discovery_status: SOURCE_DISCOVERY_STATUS.failed,
    source_last_failed_at: now,
    source_discovery_failure_reason: reason,
  }
}

export function buildDiscoveryAttemptPatch(now: string) {
  return {
    source_last_discovered_at: now,
  }
}

export function buildCrawlExcludedPatch(now: string, failureCount: number) {
  return {
    source_crawl_excluded_at: now,
    source_discovery_failure_count: failureCount,
  }
}

export function buildFailedDiscoveryWithCountPatch(now: string, reason: string, failureCount: number) {
  return {
    ...buildFailedDiscoveryPatch(now, reason),
    source_discovery_failure_count: failureCount,
  }
}
