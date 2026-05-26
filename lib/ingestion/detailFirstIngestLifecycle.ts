import {
  addressLifecycleFieldsForDb,
  type ResolvedIngestAddressLifecycle,
} from '@/lib/ingestion/address/resolveIngestAddressLifecycle'
import { isResolvedAddressPublishable } from '@/lib/ingestion/publishPreflight'
import type { IngestionStatus } from '@/lib/ingestion/types'

export type DetailFirstIngestLifecycleResult = {
  status: IngestionStatus
  lifecycle: ResolvedIngestAddressLifecycle
}

/**
 * Detail-first row status + address lifecycle: never `ready` when publish address preflight would fail.
 */
export function resolveDetailFirstIngestLifecycle(input: {
  addressLifecycle: ResolvedIngestAddressLifecycle
  normalizedLine: string | null
  city: string
  state: string
  nativeFirst: boolean
}): DetailFirstIngestLifecycleResult {
  const publishableAddress = isResolvedAddressPublishable(
    input.normalizedLine,
    input.city,
    input.state
  )

  if (publishableAddress) {
    return {
      status: 'ready',
      lifecycle: {
        addressStatus: 'address_available',
        canonicalSourceUrl: input.addressLifecycle.canonicalSourceUrl,
        addressUnlockAt: input.addressLifecycle.addressUnlockAt,
        nextEnrichmentAttemptAt: null,
        ingestStatus: 'ready',
      },
    }
  }

  if (input.nativeFirst) {
    return {
      status: 'needs_check',
      lifecycle: {
        addressStatus: 'address_enrichment_pending',
        canonicalSourceUrl: input.addressLifecycle.canonicalSourceUrl,
        addressUnlockAt: input.addressLifecycle.addressUnlockAt,
        nextEnrichmentAttemptAt: input.addressLifecycle.nextEnrichmentAttemptAt,
        ingestStatus: 'needs_check',
      },
    }
  }

  const addressStatus =
    input.addressLifecycle.addressStatus === 'address_available'
      ? 'address_enrichment_pending'
      : input.addressLifecycle.addressStatus

  return {
    status: 'needs_check',
    lifecycle: {
      addressStatus,
      canonicalSourceUrl: input.addressLifecycle.canonicalSourceUrl,
      addressUnlockAt: input.addressLifecycle.addressUnlockAt,
      nextEnrichmentAttemptAt: input.addressLifecycle.nextEnrichmentAttemptAt,
      ingestStatus: 'needs_check',
    },
  }
}

export function detailFirstIngestLifecycleDbFields(
  resolved: DetailFirstIngestLifecycleResult
): Record<string, unknown> {
  return {
    status: resolved.status,
    ...addressLifecycleFieldsForDb(resolved.lifecycle),
  }
}
