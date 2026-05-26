import { describe, expect, it } from 'vitest'
import { groupDuplicateCanonicalPublishClusters } from '@/lib/admin/duplicateCanonicalPublishClusters'

describe('groupDuplicateCanonicalPublishClusters', () => {
  it('returns clusters only when one canonical key maps to multiple published sales', () => {
    const clusters = groupDuplicateCanonicalPublishClusters([
      {
        ingestedSaleId: 'a1',
        publishedSaleId: 'p1',
        canonicalSaleInstanceKey: 'key-a',
        sourcePlatform: 'yardsaletreasuremap',
        sourceUrl: 'https://example.com/1',
        city: 'Austin',
        state: 'TX',
      },
      {
        ingestedSaleId: 'a2',
        publishedSaleId: 'p2',
        canonicalSaleInstanceKey: 'key-a',
        sourcePlatform: 'yardsaletreasuremap',
        sourceUrl: 'https://example.com/2',
        city: 'Austin',
        state: 'TX',
      },
      {
        ingestedSaleId: 'b1',
        publishedSaleId: 'p3',
        canonicalSaleInstanceKey: 'key-b',
        sourcePlatform: 'yardsaletreasuremap',
        sourceUrl: 'https://example.com/3',
        city: null,
        state: null,
      },
    ])

    expect(clusters).toHaveLength(1)
    expect(clusters[0].canonicalSaleInstanceKey).toBe('key-a')
    expect(clusters[0].publishedSaleCount).toBe(2)
    expect(clusters[0].rows).toHaveLength(2)
  })

  it('ignores rows where the same published sale appears twice under one key', () => {
    const clusters = groupDuplicateCanonicalPublishClusters([
      {
        ingestedSaleId: 'a1',
        publishedSaleId: 'p1',
        canonicalSaleInstanceKey: 'key-a',
        sourcePlatform: 'yardsaletreasuremap',
        sourceUrl: 'https://example.com/1',
        city: null,
        state: null,
      },
      {
        ingestedSaleId: 'a2',
        publishedSaleId: 'p1',
        canonicalSaleInstanceKey: 'key-a',
        sourcePlatform: 'yardsaletreasuremap',
        sourceUrl: 'https://example.com/1',
        city: null,
        state: null,
      },
    ])
    expect(clusters).toHaveLength(0)
  })
})
