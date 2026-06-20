import { describe, expect, it } from 'vitest'
import { classifyListFastInsertCollisionDrilldown } from '@/lib/admin/classifyListFastInsertCollisionDrilldown'

describe('classifyListFastInsertCollisionDrilldown', () => {
  it('detects same instance key with different source URL', () => {
    const canonical = 'https://yardsaletreasuremap.com/US/MA/Boston/x/new/userlisting.html'
    const drilldown = classifyListFastInsertCollisionDrilldown({
      canonicalUrl: canonical,
      saleInstanceKey: 'shared-key',
      sourceUrlMatches: [],
      instanceKeyMatches: [
        {
          id: '1',
          source_url: 'https://yardsaletreasuremap.com/US/MA/Boston/x/old/userlisting.html',
          status: 'ready',
          published_sale_id: null,
          sale_instance_key: 'shared-key',
          address_status: 'address_available',
          is_duplicate: false,
        },
      ],
      salesById: new Map(),
    })

    expect(drilldown.sameInstanceKeyMatch).toBe(true)
    expect(drilldown.sameInstanceKeyDifferentUrl).toBe(true)
    expect(drilldown.noCollisionMatch).toBe(false)
  })

  it('marks no_collision_match when no URL or instance key row exists', () => {
    const drilldown = classifyListFastInsertCollisionDrilldown({
      canonicalUrl: 'https://yardsaletreasuremap.com/US/MA/Boston/x/1/userlisting.html',
      saleInstanceKey: 'orphan-key',
      sourceUrlMatches: [],
      instanceKeyMatches: [],
      salesById: new Map(),
    })

    expect(drilldown.noCollisionMatch).toBe(true)
  })
})
