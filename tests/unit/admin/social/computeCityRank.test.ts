import { describe, it, expect } from 'vitest'
import { computeCityRankBySlug } from '@/lib/admin/social/computeCityRank'
import {
  TEST_SEO_METRO_AUSTIN,
  TEST_SEO_METRO_DALLAS,
  TEST_SEO_METRO_PHOENIX,
} from '../../seo/seoTestFixtures'

describe('computeCityRankBySlug', () => {
  const metros = [TEST_SEO_METRO_DALLAS, TEST_SEO_METRO_AUSTIN, TEST_SEO_METRO_PHOENIX]

  it('ranks by count descending', () => {
    const counts = {
      'dallas-tx': 100,
      'austin-tx': 50,
      'phoenix-az': 200,
    }
    expect(computeCityRankBySlug(metros, counts, 'phoenix-az')).toBe(1)
    expect(computeCityRankBySlug(metros, counts, 'dallas-tx')).toBe(2)
    expect(computeCityRankBySlug(metros, counts, 'austin-tx')).toBe(3)
  })

  it('tie-breaks by slug ascending', () => {
    const counts = {
      'dallas-tx': 10,
      'austin-tx': 10,
      'phoenix-az': 10,
    }
    expect(computeCityRankBySlug(metros, counts, 'austin-tx')).toBe(1)
    expect(computeCityRankBySlug(metros, counts, 'dallas-tx')).toBe(2)
    expect(computeCityRankBySlug(metros, counts, 'phoenix-az')).toBe(3)
  })

  it('treats missing slug counts as zero', () => {
    const counts = { 'dallas-tx': 5 }
    expect(computeCityRankBySlug(metros, counts, 'austin-tx')).toBe(2)
    expect(computeCityRankBySlug(metros, counts, 'phoenix-az')).toBe(3)
  })
})
