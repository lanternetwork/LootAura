import { describe, expect, it } from 'vitest'
import { mergeHttpsSourcePages } from '@/lib/ingestion/discovery/discoveryConfigPatches'

describe('mergeHttpsSourcePages', () => {
  it('appends new validated pages without dropping existing', () => {
    const existing = ['https://yardsaletreasuremap.com/US/Kentucky/louisville.html']
    const merged = mergeHttpsSourcePages(existing, 'https://yardsaletreasuremap.com/US/Kentucky/louisville-alt.html')
    expect(merged).toHaveLength(2)
    expect(merged).toContain(existing[0])
  })

  it('rejects non-https entries', () => {
    const merged = mergeHttpsSourcePages([], 'http://example.com/page.html')
    expect(merged).toEqual([])
  })
})
