import { SOURCE_DISCOVERY_STATUS } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'

export function buildValidatedSourcePagesPatch(now: string, canonicalUrl: string) {
  return {
    source_pages: [canonicalUrl],
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
