import { describe, expect, it } from 'vitest'
import {
  classifyDetailFirstFallbackSkip,
  classifyExistingUrlSkip,
  classifySoftDedupeListSkip,
  suspiciousCrawlSkipSubReasons,
} from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import { evaluateCrawlSkipTaxonomyOperationalHealth } from '@/lib/ingestion/acquisition/crawlSkipTaxonomyOperationalHealth'
import {
  emptyCrawlSkipTaxonomyRollup,
  finalizeCrawlSkipTaxonomyRollup,
} from '@/lib/admin/crawlSkipTaxonomyMetrics'

describe('externalCrawlSkipTaxonomy', () => {
  it('classifies existing URL skip when start dates diverge beyond tolerance', () => {
    const reason = classifyExistingUrlSkip({
      listingStartDate: '2026-06-01',
      listingEndDate: null,
      listingAddressRaw: '123 Main St',
      existing: {
        status: 'ready',
        failure_reasons: null,
        date_start: '2026-05-01',
        date_end: null,
        normalized_address: '123 main st',
      },
    })
    expect(reason).toBe('url_match_dates_changed')
  })

  it('classifies existing URL skip when normalized address differs', () => {
    const reason = classifyExistingUrlSkip({
      listingStartDate: '2026-05-10',
      listingEndDate: null,
      listingAddressRaw: '456 Oak Ave',
      existing: {
        status: 'ready',
        failure_reasons: null,
        date_start: '2026-05-10',
        date_end: null,
        normalized_address: '123 main st',
      },
    })
    expect(reason).toBe('url_match_location_changed')
  })

  it('classifies soft dedupe exact vs cross-city', () => {
    expect(classifySoftDedupeListSkip({ suppress: true, confidence: 'exact_duplicate' })).toBe(
      'soft_dedupe_exact_address_date'
    )
    expect(classifySoftDedupeListSkip({ suppress: true, confidence: 'low' })).toBe(
      'soft_dedupe_cross_city'
    )
  })

  it('maps detail-first fallback reasons to operational/suspicious buckets', () => {
    expect(classifyDetailFirstFallbackSkip('address_validation_failed')).toBe('gated_false_positive')
    expect(classifyDetailFirstFallbackSkip('sale_expired_at_discovery')).toBe('expired_false_positive')
    expect(classifyDetailFirstFallbackSkip('publish_failed')).toBe('publish_failed')
  })
})

describe('crawlSkipTaxonomyOperationalHealth', () => {
  it('alerts on elevated suspicious share when sample size is sufficient', () => {
    const rollup = finalizeCrawlSkipTaxonomyRollup({
      ...emptyCrawlSkipTaxonomyRollup(),
      subReasons: {
        ...emptyCrawlSkipTaxonomyRollup().subReasons,
        url_match_dates_changed: 10,
        url_match_same_dates: 5,
      },
    })
    expect(suspiciousCrawlSkipSubReasons(rollup.subReasons)).toBe(10)
    const health = evaluateCrawlSkipTaxonomyOperationalHealth(rollup)
    expect(health.healthy).toBe(false)
    expect(health.alerts.some((a) => a.code === 'crawl_skip_suspicious_share_elevated')).toBe(true)
  })

  it('stays healthy below minimum sample size', () => {
    const rollup = finalizeCrawlSkipTaxonomyRollup({
      ...emptyCrawlSkipTaxonomyRollup(),
      subReasons: {
        ...emptyCrawlSkipTaxonomyRollup().subReasons,
        url_match_dates_changed: 5,
      },
    })
    expect(evaluateCrawlSkipTaxonomyOperationalHealth(rollup).healthy).toBe(true)
  })
})
