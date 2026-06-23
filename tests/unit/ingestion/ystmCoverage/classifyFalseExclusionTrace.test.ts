import { describe, expect, it } from 'vitest'
import { classifyFalseExclusionTrace } from '@/lib/ingestion/ystmCoverage/classifyFalseExclusionTrace'

const baseObservation = {
  canonicalUrl: 'https://yardsaletreasuremap.com/US/TX/Austin/1/listing.html',
  state: 'TX',
  city: 'Austin',
  configKey: 'TX|Austin',
  missingIngestionOutcome: null as string | null,
  missingIngestionAttemptedAt: null as string | null,
  missingIngestionFailureReason: null as string | null,
  lastDetailCheckedAt: '2026-05-22T06:00:00Z',
}

const crawlableConfig = {
  enabled: true,
  source_pages: ['https://yardsaletreasuremap.com/US/Texas/Austin/Austin.html'],
  source_crawl_excluded_at: null,
  source_crawl_last_at: '2026-05-22T08:00:00Z',
}

describe('classifyFalseExclusionTrace', () => {
  it('classifies never_crawled when config missing', () => {
    const r = classifyFalseExclusionTrace({
      observation: baseObservation,
      ingested: null,
      config: null,
      visibleInPublishedIndex: false,
      nowIso: '2026-05-22T10:00:00Z',
    })
    expect(r.primaryBucket).toBe('never_crawled')
  })

  it('classifies crawl_not_yet_rotated when crawlable but no ingested row', () => {
    const r = classifyFalseExclusionTrace({
      observation: baseObservation,
      ingested: null,
      config: crawlableConfig,
      visibleInPublishedIndex: false,
      nowIso: '2026-05-22T10:00:00Z',
    })
    expect(r.primaryBucket).toBe('crawl_not_yet_rotated')
    expect(r.secondaryTags).toContain('missing_ingest_never_attempted')
  })

  it('classifies url_reuse_suspected when ingested expired but YSTM valid-active', () => {
    const r = classifyFalseExclusionTrace({
      observation: baseObservation,
      ingested: {
        id: 'row-1',
        source_url: baseObservation.canonicalUrl,
        status: 'expired',
        published_sale_id: null,
        is_duplicate: false,
        address_status: 'address_available',
        failure_reasons: ['sale_expired'],
        date_start: '2026-05-10',
        date_end: '2026-05-11',
        catalog_repair_outcome: null,
        source_listing_id: '1',
        sale_instance_key: null,
        address_enrichment_attempts: null,
        next_enrichment_attempt_at: null,
        address_unlock_at: null,
        last_address_enrichment_attempt_at: null,
      },
      config: crawlableConfig,
      visibleInPublishedIndex: false,
      nowIso: '2026-05-22T10:00:00Z',
    })
    expect(r.primaryBucket).toBe('url_reuse_suspected')
  })

  it('classifies url_duplicate_suppressed from missing-ingest skipped_existing', () => {
    const r = classifyFalseExclusionTrace({
      observation: {
        ...baseObservation,
        missingIngestionAttemptedAt: '2026-05-22T09:00:00Z',
        missingIngestionOutcome: 'skipped_existing',
      },
      ingested: null,
      config: crawlableConfig,
      visibleInPublishedIndex: false,
      nowIso: '2026-05-22T10:00:00Z',
    })
    expect(r.primaryBucket).toBe('url_duplicate_suppressed')
  })

  it('classifies repair_pending for ready ingested row not visible', () => {
    const r = classifyFalseExclusionTrace({
      observation: baseObservation,
      ingested: {
        id: 'row-2',
        source_url: baseObservation.canonicalUrl,
        status: 'ready',
        published_sale_id: null,
        is_duplicate: false,
        address_status: 'address_available',
        failure_reasons: [],
        date_start: '2026-05-20',
        date_end: '2026-05-21',
        catalog_repair_outcome: null,
        source_listing_id: null,
        sale_instance_key: 'external_page_source:TX|austin|no_addr:2026-05-20|2026-05-21:content:abc',
        address_enrichment_attempts: null,
        next_enrichment_attempt_at: null,
        address_unlock_at: null,
        last_address_enrichment_attempt_at: null,
      },
      config: crawlableConfig,
      visibleInPublishedIndex: false,
      nowIso: '2026-05-22T10:00:00Z',
    })
    expect(r.primaryBucket).toBe('repair_pending')
  })

  it('classifies terminal disposition instead of repair_pending for terminal needs_check', () => {
    const r = classifyFalseExclusionTrace({
      observation: baseObservation,
      ingested: {
        id: 'row-3',
        source_url: baseObservation.canonicalUrl,
        status: 'needs_check',
        published_sale_id: null,
        is_duplicate: false,
        address_status: 'address_terminal_active',
        failure_reasons: [],
        date_start: '2026-05-20',
        date_end: '2026-05-21',
        catalog_repair_outcome: null,
        source_listing_id: null,
        sale_instance_key: null,
        address_enrichment_attempts: null,
        next_enrichment_attempt_at: null,
        address_unlock_at: null,
        last_address_enrichment_attempt_at: null,
      },
      config: crawlableConfig,
      visibleInPublishedIndex: false,
      nowIso: '2026-05-22T10:00:00Z',
    })
    expect(r.primaryBucket).toBe('terminal_disposition')
    expect(r.primaryBucket).not.toBe('repair_pending')
  })

  it('flags observation_stale when visible in published index', () => {
    const r = classifyFalseExclusionTrace({
      observation: baseObservation,
      ingested: null,
      config: crawlableConfig,
      visibleInPublishedIndex: true,
      nowIso: '2026-05-22T10:00:00Z',
    })
    expect(r.primaryBucket).toBe('published_not_visible')
    expect(r.secondaryTags).toContain('observation_stale')
  })

  it('classifies schedule_wait for address-gated unlock schedule waits', () => {
    const unlockUrl =
      'https://yardsaletreasuremap.com/US/Texas/Austin/See-source-for-address-after-2026-06-06-14%3A00%3A00/1/listing.html'
    const r = classifyFalseExclusionTrace({
      observation: { ...baseObservation, canonicalUrl: unlockUrl },
      ingested: {
        id: 'row-gated',
        source_url: unlockUrl,
        status: 'needs_check',
        published_sale_id: null,
        is_duplicate: false,
        address_status: 'address_gated',
        failure_reasons: [],
        date_start: '2026-05-20',
        date_end: '2026-05-21',
        catalog_repair_outcome: null,
        source_listing_id: null,
        sale_instance_key: null,
        address_enrichment_attempts: 1,
        next_enrichment_attempt_at: null,
        address_unlock_at: '2026-06-06T13:00:00.000Z',
        last_address_enrichment_attempt_at: null,
      },
      config: crawlableConfig,
      visibleInPublishedIndex: false,
      nowIso: '2026-06-06T12:00:00.000Z',
    })
    expect(r.primaryBucket).toBe('schedule_wait')
  })

  it('classifies residual gated_false_positive when unlock elapsed', () => {
    const unlockUrl =
      'https://yardsaletreasuremap.com/US/Texas/Austin/See-source-for-address-after-2026-06-06-14%3A00%3A00/1/listing.html'
    const r = classifyFalseExclusionTrace({
      observation: { ...baseObservation, canonicalUrl: unlockUrl },
      ingested: {
        id: 'row-gated',
        source_url: unlockUrl,
        status: 'needs_check',
        published_sale_id: null,
        is_duplicate: false,
        address_status: 'address_gated',
        failure_reasons: [],
        date_start: '2026-05-20',
        date_end: '2026-05-21',
        catalog_repair_outcome: null,
        source_listing_id: null,
        sale_instance_key: null,
        address_enrichment_attempts: 1,
        next_enrichment_attempt_at: null,
        address_unlock_at: '2026-06-06T10:00:00.000Z',
        last_address_enrichment_attempt_at: null,
      },
      config: crawlableConfig,
      visibleInPublishedIndex: false,
      nowIso: '2026-06-06T15:00:00.000Z',
    })
    expect(r.primaryBucket).toBe('gated_false_positive')
  })
})
