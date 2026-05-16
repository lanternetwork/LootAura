import { describe, it, expect } from 'vitest'
import {
  addressSignalsWeakConfidence,
  calendarDaysBetweenUtc,
  evaluateSoftDuplicateAgainstCandidates,
  isGenericSaleTitle,
  normalizeTitleForDedupe,
  titleOverlapPercent,
  SOFT_SUPPRESS_MIN_SCORE,
  type DuplicateScoringIncoming,
  type SoftDuplicateCandidateRow,
} from '@/lib/ingestion/duplicateScoring'

function row(p: Partial<SoftDuplicateCandidateRow> & Pick<SoftDuplicateCandidateRow, 'id' | 'date_start'>): SoftDuplicateCandidateRow {
  return {
    date_end: null,
    title: null,
    source_platform: null,
    external_id: null,
    lat: null,
    lng: null,
    image_source_url: null,
    ...p,
  }
}

describe('duplicateScoring', () => {
  it('treats exact garage sale title as generic', () => {
    expect(isGenericSaleTitle(normalizeTitleForDedupe('Garage Sale'))).toBe(true)
  })

  it('does not treat distinctive titles as generic', () => {
    expect(isGenericSaleTitle(normalizeTitleForDedupe('Vintage LEGO 12 tables in Oak Park'))).toBe(false)
  })

  it('detects weak address signals for apartments', () => {
    expect(addressSignalsWeakConfidence('123 main st unit 4b, chicago, il')).toBe(true)
  })

  it('computes deterministic title overlap', () => {
    const a = normalizeTitleForDedupe('HUGE Multi Family tools toys 5/10')
    const b = normalizeTitleForDedupe('multi family tools and toys May 10')
    expect(titleOverlapPercent(a, b)).toBeGreaterThan(20)
  })

  it('exact duplicate signal: same external id + adjacent day repost', () => {
    const incoming: DuplicateScoringIncoming = {
      normalizedAddress: '500 elm st, chicago, il',
      dateStart: '2026-06-02',
      dateEnd: '2026-06-02',
      normalizedTitle: normalizeTitleForDedupe('Oak table estate lot'),
      sourcePlatform: 'external_page_source',
      externalId: '555',
      imageSourceUrl: null,
      lat: null,
      lng: null,
    }
    const candidates = [
      row({
        id: 'b',
        date_start: '2026-06-03',
        external_id: '555',
        source_platform: 'external_page_source',
        title: 'Oak table estate lot',
      }),
      row({
        id: 'a',
        date_start: '2026-06-03',
        external_id: '555',
        source_platform: 'external_page_source',
        title: 'Oak table estate lot',
      }),
    ]
    const out = evaluateSoftDuplicateAgainstCandidates(incoming, candidates)
    expect(out.suppress).toBe(true)
    expect(out.confidence).toBe('recurring_repost')
    expect(out.winner?.id).toBe('a')
  })

  it('tie-breaks equal scores by lexicographically smallest id', () => {
    const incoming: DuplicateScoringIncoming = {
      normalizedAddress: '10 pine st, chicago, il',
      dateStart: '2026-07-01',
      dateEnd: null,
      normalizedTitle: normalizeTitleForDedupe('Moving Sale Saturday'),
      sourcePlatform: 'manual_upload',
      externalId: null,
      imageSourceUrl: null,
      lat: null,
      lng: null,
    }
    const same = {
      date_start: '2026-07-01',
      title: 'Moving Sale Saturday',
      source_platform: 'manual_upload',
      external_id: null,
    }
    const candidates = [
      row({ id: 'z1', ...same }),
      row({ id: 'm1', ...same }),
    ]
    const out = evaluateSoftDuplicateAgainstCandidates(incoming, candidates)
    expect(out.winner?.id).toBe('m1')
  })

  it('near-but-distinct same day: low title overlap stays weak_match', () => {
    const incoming: DuplicateScoringIncoming = {
      normalizedAddress: '400 builder ln unit 12, chicago, il',
      dateStart: '2026-08-01',
      dateEnd: null,
      normalizedTitle: normalizeTitleForDedupe('aaaaaa north'),
      sourcePlatform: 'manual_upload',
      externalId: null,
      imageSourceUrl: null,
      lat: null,
      lng: null,
    }
    const candidates = [
      row({
        id: 'n1',
        date_start: '2026-08-01',
        title: 'bbbbbb south',
        source_platform: 'manual_upload',
      }),
    ]
    const out = evaluateSoftDuplicateAgainstCandidates(incoming, candidates)
    expect(out.suppress).toBe(false)
    expect(out.confidence).toBe('weak_match')
    expect(out.bestScore).toBeLessThan(SOFT_SUPPRESS_MIN_SCORE)
  })

  it('generic title requires higher score — garage + address-only stays weak', () => {
    const incoming: DuplicateScoringIncoming = {
      normalizedAddress: '9 elm st, chicago, il',
      dateStart: '2026-09-10',
      dateEnd: null,
      normalizedTitle: normalizeTitleForDedupe('Garage Sale'),
      sourcePlatform: 'crawler',
      externalId: null,
      imageSourceUrl: null,
      lat: null,
      lng: null,
    }
    const candidates = [
      row({
        id: 'g1',
        date_start: '2026-09-11',
        title: 'Yard Sale',
        source_platform: 'crawler',
      }),
    ]
    const out = evaluateSoftDuplicateAgainstCandidates(incoming, candidates)
    expect(out.suppress).toBe(false)
    expect(out.confidence).toBe('weak_match')
  })

  it('same address different future sale outside fetch window is distinct', () => {
    const incoming: DuplicateScoringIncoming = {
      normalizedAddress: '1 main st, chicago, il',
      dateStart: '2026-10-01',
      dateEnd: null,
      normalizedTitle: normalizeTitleForDedupe('October community sale'),
      sourcePlatform: 'manual_upload',
      externalId: null,
      imageSourceUrl: null,
      lat: null,
      lng: null,
    }
    const candidates = [
      row({
        id: 'f1',
        date_start: '2026-10-20',
        title: 'October community sale',
        source_platform: 'manual_upload',
      }),
    ]
    const out = evaluateSoftDuplicateAgainstCandidates(incoming, candidates)
    expect(out.winner).toBeNull()
    expect(out.confidence).toBe('distinct_listing')
  })

  it('calendarDaysBetweenUtc is symmetric', () => {
    expect(calendarDaysBetweenUtc('2026-01-02', '2026-01-05')).toBe(3)
    expect(calendarDaysBetweenUtc('2026-01-05', '2026-01-02')).toBe(3)
  })

  it('image URL match boosts score for extension vs crawler overlap', () => {
    const url = 'https://cdn.example.com/listing-cover.jpg'
    const incoming: DuplicateScoringIncoming = {
      normalizedAddress: '77 birch rd, chicago, il',
      dateStart: '2026-11-02',
      dateEnd: null,
      normalizedTitle: normalizeTitleForDedupe('Tools and hardware'),
      sourcePlatform: 'extension',
      externalId: null,
      imageSourceUrl: url,
      lat: null,
      lng: null,
    }
    const candidates = [
      row({
        id: 'img1',
        date_start: '2026-11-02',
        title: 'Tools and hardware',
        source_platform: 'external_page_source',
        image_source_url: url,
      }),
    ]
    const out = evaluateSoftDuplicateAgainstCandidates(incoming, candidates)
    expect(out.suppress).toBe(true)
    expect(out.confidence).toBe('probable_duplicate')
  })
})
