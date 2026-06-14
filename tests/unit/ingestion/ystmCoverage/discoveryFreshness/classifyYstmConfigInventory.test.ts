import { describe, expect, it } from 'vitest'
import {
  classifyYstmConfigInventory,
  computeInventoryConcentrationThresholds,
  recommendYstmVelocityPool,
} from '@/lib/ingestion/ystmCoverage/discoveryFreshness/classifyYstmConfigInventory'

describe('classifyYstmConfigInventory', () => {
  const nowMs = Date.parse('2026-06-01T00:00:00.000Z')

  it('classifies configs by last listing activity', () => {
    expect(
      classifyYstmConfigInventory({
        lastListingSeenAt: '2026-05-20T00:00:00.000Z',
        nowMs,
      })
    ).toBe('ACTIVE')
    expect(
      classifyYstmConfigInventory({
        lastListingSeenAt: '2026-03-15T00:00:00.000Z',
        nowMs,
      })
    ).toBe('LOW_ACTIVITY')
    expect(
      classifyYstmConfigInventory({
        lastListingSeenAt: '2026-02-01T00:00:00.000Z',
        nowMs,
      })
    ).toBe('DORMANT')
    expect(classifyYstmConfigInventory({ lastListingSeenAt: null, nowMs })).toBe('DEAD')
  })

  it('recommends velocity pools from inventory class and yield', () => {
    expect(
      recommendYstmVelocityPool({ inventoryClass: 'ACTIVE', listingsPerDay: 10 })
    ).toBe('HOT')
    expect(
      recommendYstmVelocityPool({ inventoryClass: 'ACTIVE', listingsPerDay: 2 })
    ).toBe('WARM')
    expect(
      recommendYstmVelocityPool({ inventoryClass: 'DORMANT', listingsPerDay: 10 })
    ).toBe('COLD')
  })

  it('computes inventory concentration thresholds', () => {
    const result = computeInventoryConcentrationThresholds([
      { configKey: 'A', listingsPerWeek: 70 },
      { configKey: 'B', listingsPerWeek: 20 },
      { configKey: 'C', listingsPerWeek: 10 },
    ])
    expect(result.configsFor50PctListings).toBe(1)
    expect(result.configsFor80PctListings).toBe(2)
    expect(result.zeroYieldConfigCount).toBe(0)
  })
})
