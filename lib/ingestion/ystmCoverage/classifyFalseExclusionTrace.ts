import { isCatalogRepairCandidateRow } from '@/lib/ingestion/ystmCoverage/ystmCatalogRepairCandidates'
import { MISSING_INGEST_TERMINAL_FAILURE_REASON } from '@/lib/ingestion/ystmCoverage/missingIngestFetchFailedRecoveryConfig'
import { isTerminalAddressDisposition } from '@/lib/ingestion/address/terminalAddressDisposition'
import {
  type FalseExclusionSecondaryTag,
  type FalseExclusionTraceBucket,
  type FalseExclusionTraceEvidence,
  type FalseExclusionUrlTrace,
} from '@/lib/ingestion/ystmCoverage/falseExclusionTraceTypes'
import { isIngestedRowExpiredForDuplicate } from '@/lib/ingestion/acquisition/duplicateSkipKinds'
import { isScheduleWaitFalseExclusion } from '@/lib/ingestion/ystmCoverage/resolveScheduleWaitFalseExclusion'
import { partitionCrawlableExternalCityConfigs } from '@/lib/ingestion/partitionCrawlableExternalConfigs'

export type FalseExclusionObservationInput = {
  canonicalUrl: string
  state: string | null
  city: string | null
  configKey: string | null
  missingIngestionOutcome: string | null
  missingIngestionAttemptedAt: string | null
  missingIngestionFailureReason: string | null
  lastDetailCheckedAt: string | null
}

export type FalseExclusionIngestedRowSnapshot = {
  id: string
  source_url: string
  status: string
  published_sale_id: string | null
  is_duplicate: boolean
  address_status: string | null
  failure_reasons: unknown
  date_start: string | null
  date_end: string | null
  catalog_repair_outcome: string | null
  source_listing_id: string | null
  sale_instance_key: string | null
  address_enrichment_attempts: number | null
  next_enrichment_attempt_at: string | null
  address_unlock_at: string | null
  last_address_enrichment_attempt_at: string | null
}

export type FalseExclusionConfigSnapshot = {
  enabled: boolean
  source_pages: unknown
  source_crawl_excluded_at: string | null
  source_crawl_last_at: string | null
} | null

export type ClassifyFalseExclusionInput = {
  observation: FalseExclusionObservationInput
  ingested: FalseExclusionIngestedRowSnapshot | null
  config: FalseExclusionConfigSnapshot
  visibleInPublishedIndex: boolean
  nowIso: string
}

function failureReasonList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is string => typeof r === 'string')
}

function mapMissingIngestFailureToBucket(reason: string | null): FalseExclusionTraceBucket {
  const r = (reason ?? '').toLowerCase()
  if (r.includes('address_validation')) return 'address_validation_failed'
  if (r.includes('spatial') || r.includes('geocode') || r.includes('coordinate')) {
    return 'spatial_lookup_failed'
  }
  if (r.includes('insert')) return 'insert_failed'
  if (r.includes('gated')) return 'gated_false_positive'
  if (r.includes('expired')) return 'expired_false_positive'
  return 'detail_first_fallback'
}

function buildEvidence(input: ClassifyFalseExclusionInput): FalseExclusionTraceEvidence {
  const { ingested, config, visibleInPublishedIndex } = input
  const partition =
    config != null
      ? partitionCrawlableExternalCityConfigs([
          {
            city: input.observation.city ?? '',
            state: input.observation.state ?? '',
            source_platform: 'external_page_source',
            source_pages: config.source_pages,
            source_crawl_excluded_at: config.source_crawl_excluded_at,
          },
        ])
      : null

  return {
    hasIngestedRow: ingested != null,
    ingestedStatus: ingested?.status ?? null,
    ingestedPublishedSaleId: ingested?.published_sale_id ?? null,
    isDuplicate: ingested?.is_duplicate === true,
    addressStatus: ingested?.address_status ?? null,
    configEnabled: config?.enabled ?? null,
    configHasSourcePages: partition ? partition.configsCrawlable > 0 : null,
    configCrawlExcluded:
      config?.source_crawl_excluded_at != null && config.source_crawl_excluded_at !== '',
    configLastCrawlAt: config?.source_crawl_last_at ?? null,
    missingIngestionOutcome: input.observation.missingIngestionOutcome,
    missingIngestionFailureReason: input.observation.missingIngestionFailureReason,
    visibleInPublishedIndex,
    catalogRepairEligible: ingested
      ? isCatalogRepairCandidateRow(
          {
            source_url: input.observation.canonicalUrl,
            status: ingested.status,
            published_sale_id: ingested.published_sale_id,
            address_status: ingested.address_status,
          },
          { excludeTerminalDisposition: true }
        )
      : false,
    sourceListingId: ingested?.source_listing_id ?? null,
    saleInstanceKey: ingested?.sale_instance_key ?? null,
  }
}

/**
 * Assign exactly one primary bucket for a missing valid YSTM URL (Phase 1).
 */
export function classifyFalseExclusionTrace(input: ClassifyFalseExclusionInput): Omit<
  FalseExclusionUrlTrace,
  'canonicalUrl' | 'state' | 'city' | 'configKey' | 'tracedAt'
> {
  const tags: FalseExclusionSecondaryTag[] = []
  const { observation, ingested, config, visibleInPublishedIndex } = input
  const evidence = buildEvidence(input)

  if (visibleInPublishedIndex) {
    tags.push('observation_stale')
    return {
      primaryBucket: 'published_not_visible',
      secondaryTags: tags,
      summary: 'Sale is visible in published index but observation still marked missing; re-run coverage audit.',
      evidence,
    }
  }

  const partition =
    config != null
      ? partitionCrawlableExternalCityConfigs([
          {
            city: observation.city ?? '',
            state: observation.state ?? '',
            source_platform: 'external_page_source',
            source_pages: config.source_pages,
            source_crawl_excluded_at: config.source_crawl_excluded_at,
          },
        ])
      : null
  const configCrawlable = partition != null && partition.configsCrawlable > 0
  const configExcluded =
    config?.source_crawl_excluded_at != null && config.source_crawl_excluded_at !== ''

  if (!config || config.enabled === false) {
    tags.push('config_not_crawlable')
    return {
      primaryBucket: 'never_crawled',
      secondaryTags: tags,
      summary: 'No enabled ingestion city config for this observation.',
      evidence,
    }
  }

  if (configExcluded) {
    tags.push('config_crawl_excluded')
    return {
      primaryBucket: 'never_crawled',
      secondaryTags: tags,
      summary: 'City config is crawl-excluded.',
      evidence,
    }
  }

  if (!configCrawlable) {
    tags.push('config_not_crawlable')
    return {
      primaryBucket: 'never_crawled',
      secondaryTags: tags,
      summary: 'Config has no crawlable HTTPS source_pages.',
      evidence,
    }
  }

  if (ingested?.is_duplicate) {
    return {
      primaryBucket: 'soft_dedupe_suppressed',
      secondaryTags: tags,
      summary: 'Ingested row marked duplicate; not published as distinct listing.',
      evidence,
    }
  }

  if (
    ingested &&
    isIngestedRowExpiredForDuplicate(ingested.status, ingested.failure_reasons)
  ) {
    return {
      primaryBucket: 'url_reuse_suspected',
      secondaryTags: tags,
      summary:
        'Ingested row is expired but YSTM audit still marks URL valid-active; likely reused URL for a new event.',
      evidence,
    }
  }

  if (ingested && ingested.address_status === 'address_gated') {
    const nowMs = Date.parse(input.nowIso)
    const resolvedNowMs = Number.isFinite(nowMs) ? nowMs : Date.now()
    if (
      isScheduleWaitFalseExclusion({
        ingested,
        sourceUrl: input.observation.canonicalUrl,
        nowMs: resolvedNowMs,
      })
    ) {
      return {
        primaryBucket: 'schedule_wait',
        secondaryTags: tags,
        summary:
          'Ingested row is address-gated with unlock scheduled in the future; expected schedule wait.',
        evidence,
      }
    }
    return {
      primaryBucket: 'gated_false_positive',
      secondaryTags: tags,
      summary: 'Ingested row is address-gated; may be valid on YSTM but blocked pending unlock.',
      evidence,
    }
  }

  if (ingested && isTerminalAddressDisposition(ingested.address_status)) {
    return {
      primaryBucket: 'terminal_disposition',
      secondaryTags: tags,
      summary: 'Ingested row has terminal address disposition; excluded from catalog repair queue.',
      evidence,
    }
  }

  if (ingested && evidence.catalogRepairEligible) {
    tags.push('catalog_repair_queue')
    if (ingested.catalog_repair_outcome === 'failed') {
      return {
        primaryBucket: 'repair_failed',
        secondaryTags: tags,
        summary: 'Row is in catalog repair queue; last repair attempt failed.',
        evidence,
      }
    }
    return {
      primaryBucket: 'repair_pending',
      secondaryTags: tags,
      summary: 'Row is in catalog repair queue (needs_geocode, ready, publish_failed, needs_check).',
      evidence,
    }
  }

  if (ingested?.status === 'publish_failed') {
    return {
      primaryBucket: 'publish_failed',
      secondaryTags: tags,
      summary: 'Ingested row has publish_failed status.',
      evidence,
    }
  }

  if (ingested?.published_sale_id) {
    return {
      primaryBucket: 'published_not_visible',
      secondaryTags: tags,
      summary: 'Ingested row linked to published sale but not visible in audit footprint (filters/coords).',
      evidence,
    }
  }

  if (ingested) {
    const reasons = failureReasonList(ingested.failure_reasons)
    if (reasons.includes('sale_expired')) {
      return {
        primaryBucket: 'expired_false_positive',
        secondaryTags: tags,
        summary: 'Ingested row flagged sale_expired while YSTM audit marks valid-active.',
        evidence,
      }
    }
    if (
      ingested.status === 'needs_geocode' ||
      ingested.status === 'needs_check' ||
      ingested.status === 'ready'
    ) {
      if (isTerminalAddressDisposition(ingested.address_status)) {
        return {
          primaryBucket: 'terminal_disposition',
          secondaryTags: tags,
          summary: 'Terminal address disposition on ingested row (not repair-pending).',
          evidence,
        }
      }
      return {
        primaryBucket: 'repair_pending',
        secondaryTags: tags,
        summary: `Ingested row exists (${ingested.status}) but not visible on map.`,
        evidence,
      }
    }
  }

  if (!ingested) {
    const outcome = observation.missingIngestionOutcome
    if (!observation.missingIngestionAttemptedAt) {
      tags.push('missing_ingest_never_attempted')
      if (!config.source_crawl_last_at) {
        return {
          primaryBucket: 'never_crawled',
          secondaryTags: tags,
          summary: 'No ingested row and config has never been crawled.',
          evidence,
        }
      }
      return {
        primaryBucket: 'crawl_not_yet_rotated',
        secondaryTags: tags,
        summary: 'No ingested row; city config not yet rotated to this listing in bounded crawl.',
        evidence,
      }
    }

    if (outcome === 'skipped_existing') {
      return {
        primaryBucket: 'url_duplicate_suppressed',
        secondaryTags: tags,
        summary: 'Missing-ingest cron skipped: non-duplicate ingested row already exists for URL.',
        evidence,
      }
    }

    if (outcome === 'terminal' && observation.missingIngestionFailureReason === MISSING_INGEST_TERMINAL_FAILURE_REASON) {
      tags.push('missing_ingest_terminal')
      return {
        primaryBucket: 'detail_first_fallback',
        secondaryTags: tags,
        summary: 'Missing-ingest fetch_failed exhausted bounded replays (terminal).',
        evidence,
      }
    }

    if (outcome === 'failed') {
      tags.push('missing_ingest_failed')
      const bucket = mapMissingIngestFailureToBucket(observation.missingIngestionFailureReason)
      return {
        primaryBucket: bucket,
        secondaryTags: tags,
        summary: `Missing-ingest attempt failed (${observation.missingIngestionFailureReason ?? 'no reason'}).`,
        evidence,
      }
    }

    if (outcome === 'ingested' || outcome === 'published') {
      tags.push('observation_stale')
      return {
        primaryBucket: 'published_not_visible',
        secondaryTags: tags,
        summary: 'Missing-ingest reported success but observation not marked visible; refresh audit.',
        evidence,
      }
    }

    return {
      primaryBucket: 'crawl_not_yet_rotated',
      secondaryTags: tags,
      summary: 'No ingested row; main ingestion has not captured this listing yet.',
      evidence,
    }
  }

  return {
    primaryBucket: 'unknown',
    secondaryTags: tags,
    summary: 'Could not classify; inspect ingested row and orchestration notes.',
    evidence,
  }
}
