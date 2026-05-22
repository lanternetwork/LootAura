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
        status: 'expired',
        published_sale_id: null,
        is_duplicate: false,
        address_status: 'address_available',
        failure_reasons: ['sale_expired'],
        date_start: '2026-05-10',
        date_end: '2026-05-11',
        catalog_repair_outcome: null,
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
        status: 'ready',
        published_sale_id: null,
        is_duplicate: false,
        address_status: 'address_available',
        failure_reasons: [],
        date_start: '2026-05-20',
        date_end: '2026-05-21',
        catalog_repair_outcome: null,
      },
      config: crawlableConfig,
      visibleInPublishedIndex: false,
      nowIso: '2026-05-22T10:00:00Z',
    })
    expect(r.primaryBucket).toBe('repair_pending')
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
})
