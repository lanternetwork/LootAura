import type { AddressStatus } from '@/lib/ingestion/address/addressLifecycleTypes'
import {
  computeNextEnrichmentAttemptAt,
  detectGatedListing,
  type GatedListingDiagnostics,
} from '@/lib/ingestion/address/addressGated'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isAddressGeocodeReady } from '@/lib/ingestion/address/addressUsability'
import type { IngestionStatus } from '@/lib/ingestion/types'

export type ResolvedIngestAddressLifecycle = {
  addressStatus: AddressStatus
  canonicalSourceUrl: string
  addressUnlockAt: string | null
  nextEnrichmentAttemptAt: string | null
  /** Geocode/publish pipeline status (never needs_geocode when address not ready). */
  ingestStatus: IngestionStatus
}

export function resolveIngestAddressLifecycle(input: {
  sourceUrl: string
  addressRaw: string | null | undefined
  /** When dates/address parse errors exist, keep needs_check. */
  wouldBeNeedsGeocode: boolean
  diagnostics?: GatedListingDiagnostics
  now?: Date
}): ResolvedIngestAddressLifecycle {
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const canonical = canonicalSourceUrl(input.sourceUrl)
  const gatedProbe = detectGatedListing({
    sourceUrl: input.sourceUrl,
    addressRaw: input.addressRaw,
    diagnostics: input.diagnostics,
  })

  if (isAddressGeocodeReady(input.addressRaw)) {
    return {
      addressStatus: 'address_available',
      canonicalSourceUrl: canonical,
      addressUnlockAt: gatedProbe.unlockAt?.toISOString() ?? null,
      nextEnrichmentAttemptAt: null,
      ingestStatus: input.wouldBeNeedsGeocode ? 'needs_geocode' : 'needs_check',
    }
  }

  if (gatedProbe.gated) {
    const nextAt = computeNextEnrichmentAttemptAt(gatedProbe.unlockAt, nowMs, canonical)
    const beforeUnlock = gatedProbe.unlockAt != null && gatedProbe.unlockAt.getTime() > nowMs
    return {
      addressStatus: beforeUnlock ? 'address_gated' : 'address_enrichment_pending',
      canonicalSourceUrl: canonical,
      addressUnlockAt: gatedProbe.unlockAt?.toISOString() ?? null,
      nextEnrichmentAttemptAt: nextAt.toISOString(),
      ingestStatus: 'needs_check',
    }
  }

  return {
    addressStatus: 'address_available',
    canonicalSourceUrl: canonical,
    addressUnlockAt: null,
    nextEnrichmentAttemptAt: null,
    ingestStatus: input.wouldBeNeedsGeocode ? 'needs_geocode' : 'needs_check',
  }
}

export function addressLifecycleFieldsForDb(
  resolved: ResolvedIngestAddressLifecycle
): Record<string, unknown> {
  return {
    address_status: resolved.addressStatus,
    canonical_source_url: resolved.canonicalSourceUrl,
    address_unlock_at: resolved.addressUnlockAt,
    next_enrichment_attempt_at: resolved.nextEnrichmentAttemptAt,
  }
}
