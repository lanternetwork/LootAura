/**
 * Documents expected hybrid clustering: all sales with numeric lat/lng participate in location
 * grouping; exact same coordinates (at grouping precision) collapse into one location group.
 */
import { describe, expect, it } from 'vitest'
import { groupSalesByLocation } from '@/lib/pins/hybridClustering'
import type { Sale } from '@/lib/types'

function makeSale(id: string, lat: number, lng: number): Sale {
  return {
    id,
    owner_id: 'owner-1',
    title: `Sale ${id}`,
    city: 'Chicago',
    state: 'IL',
    date_start: '2026-06-01',
    time_start: '09:00:00',
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lat,
    lng,
  }
}

describe('hybridClustering pin eligibility (verification only)', () => {
  it('includes every sale with finite numeric lat/lng in location groups', () => {
    const sales = [makeSale('a', 41.8, -87.6), makeSale('b', 41.9, -87.5)]
    const groups = groupSalesByLocation(sales, { enableLocationGrouping: true })
    const total = groups.reduce((n, g) => n + g.sales.length, 0)
    expect(total).toBe(2)
    expect(groups.length).toBe(2)
  })

  it('collapses two sales at same rounded coordinates into one location group with both sales', () => {
    const lat = 41.8781
    const lng = -87.6298
    const sales = [makeSale('one', lat, lng), makeSale('two', lat, lng)]
    const groups = groupSalesByLocation(sales, { enableLocationGrouping: true, coordinatePrecision: 6 })
    expect(groups.length).toBe(1)
    expect(groups[0].totalSales).toBe(2)
    expect(groups[0].sales.map((s) => s.id).sort()).toEqual(['one', 'two'])
  })
})
