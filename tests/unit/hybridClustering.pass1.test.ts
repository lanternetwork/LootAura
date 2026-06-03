/**
 * Pan/zoom Pass 1: SalesClient location grouping parity and createHybridPins index reuse.
 */
import { describe, expect, it } from 'vitest'
import {
  buildLocationGroupsHybridResult,
  createHybridPins,
  groupSalesByLocation,
  SALES_CLIENT_LOCATION_GROUPING_OPTIONS,
} from '@/lib/pins/hybridClustering'
import type { HybridPinsResult } from '@/lib/pins/types'
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
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
    lat,
    lng,
  }
}

const HYBRID_CLUSTERING_OPTS = {
  coordinatePrecision: 6,
  clusterRadius: 6.5,
  minClusterSize: 2,
  maxZoom: 16,
  enableLocationGrouping: true,
  enableVisualClustering: true,
}

const VIEWPORT = {
  bounds: [-88.0, 41.7, -87.5, 42.0] as [number, number, number, number],
  zoom: 12,
}

function normalizeHybridResult(result: HybridPinsResult) {
  const sortLocations = [...result.locations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((loc) => ({
      id: loc.id,
      lat: loc.lat,
      lng: loc.lng,
      totalSales: loc.totalSales,
      saleIds: loc.sales.map((s) => s.id).sort(),
    }))
  const sortPins = [...result.pins]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((pin) => ({
      type: pin.type,
      id: pin.id,
      lat: pin.lat,
      lng: pin.lng,
      count: pin.count,
      expandToZoom: pin.expandToZoom,
    }))
  return {
    type: result.type,
    locations: sortLocations,
    pins: sortPins,
  }
}

describe('hybridClustering Pass 1 — SalesClient location grouping', () => {
  const sales = [
    makeSale('a', 41.8781, -87.6298),
    makeSale('b', 41.8781, -87.6298),
    makeSale('c', 41.9, -87.6),
    makeSale('d', 41.85, -87.55),
  ]

  it('groupSalesByLocation matches createHybridPins().locations for representative fixtures', () => {
    const grouped = groupSalesByLocation(sales, SALES_CLIENT_LOCATION_GROUPING_OPTIONS)
    const fromHybrid = createHybridPins(sales, VIEWPORT, HYBRID_CLUSTERING_OPTS).locations

    const normalize = (locs: typeof grouped) =>
      [...locs]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((loc) => ({
          id: loc.id,
          lat: loc.lat,
          lng: loc.lng,
          totalSales: loc.totalSales,
          saleIds: loc.sales.map((s) => s.id).sort(),
        }))

    expect(normalize(grouped)).toEqual(normalize(fromHybrid))
  })

  it('buildLocationGroupsHybridResult exposes same locations as groupSalesByLocation', () => {
    const wrapped = buildLocationGroupsHybridResult(sales, SALES_CLIENT_LOCATION_GROUPING_OPTIONS)
    const grouped = groupSalesByLocation(sales, SALES_CLIENT_LOCATION_GROUPING_OPTIONS)
    expect(wrapped.pins).toEqual([])
    expect(wrapped.clusters).toEqual([])
    expect(wrapped.type).toBe('individual')
    expect(wrapped.locations).toEqual(grouped)
  })
})

describe('hybridClustering Pass 1 — single Supercluster index (output parity)', () => {
  it('createHybridPins output shape is stable for touch-only clustering fixtures', () => {
    const sales = [
      makeSale('1', 38.2527, -85.7585),
      makeSale('2', 38.25271, -85.7585),
      makeSale('3', 38.25272, -85.7585),
      makeSale('4', 38.26, -85.75),
      makeSale('5', 38.27, -85.74),
    ]
    const result = createHybridPins(sales, VIEWPORT, HYBRID_CLUSTERING_OPTS)
    const normalized = normalizeHybridResult(result)

    expect(normalized.locations.length).toBeGreaterThan(0)
    expect(normalized.pins.length).toBeGreaterThan(0)
    expect(normalized.pins.every((p) => p.type === 'cluster' || p.type === 'location')).toBe(true)
    expect(
      normalized.pins.filter((p) => p.type === 'cluster').every((p) => (p.count ?? 0) >= 2)
    ).toBe(true)
  })

  it('colocated multi-sale location produces cluster-coloc pin when not in visual cluster', () => {
    const sales = [makeSale('solo', 41.0, -87.0), makeSale('x', 41.8781, -87.6298), makeSale('y', 41.8781, -87.6298)]
    const result = createHybridPins(sales, VIEWPORT, HYBRID_CLUSTERING_OPTS)
    const colocPin = result.pins.find((p) => p.id.startsWith('cluster-coloc-'))
    expect(colocPin).toBeDefined()
    expect(colocPin?.count).toBe(2)
  })
})
