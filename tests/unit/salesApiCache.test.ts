/**
 * Unit tests for GET /api/sales short-TTL server cache.
 * Ensures: (b) two identical public requests hit cache on second call,
 *         (c) differing filters/bounds produce different cache keys.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  buildSalesCacheKey,
  getSalesApiCache,
  setSalesApiCache,
  clearSalesApiMemoryCache,
} from '@/lib/cache/salesApiCache'

describe('salesApiCache', () => {
  beforeEach(() => {
    clearSalesApiMemoryCache()
    vi.stubGlobal('fetch', vi.fn()) // avoid Redis in unit tests
  })

  describe('buildSalesCacheKey', () => {
    it('produces different keys for different bbox', () => {
      const base = {
        actualBbox: { north: 38.1, south: 38.0, east: -85.0, west: -85.1 },
        dateRange: 'any',
        startDateParam: null as string | null,
        endDateParam: null as string | null,
        categories: [] as string[],
        limit: 24,
        offset: 0,
        distanceKm: 40,
        q: null as string | null,
      }
      const key1 = buildSalesCacheKey({ ...base, actualBbox: { north: 38.1, south: 38.0, east: -85.0, west: -85.1 } })
      const key2 = buildSalesCacheKey({ ...base, actualBbox: { north: 38.2, south: 38.0, east: -85.0, west: -85.1 } })
      expect(key1).not.toBe(key2)
    })

    it('produces different keys for different categories', () => {
      const base = {
        actualBbox: null as any,
        nearLat: 38.25,
        nearLng: -85.76,
        radiusKm: 25,
        dateRange: 'any',
        startDateParam: null as string | null,
        endDateParam: null as string | null,
        categories: [] as string[],
        limit: 24,
        offset: 0,
        distanceKm: 40,
        q: null as string | null,
      }
      const key1 = buildSalesCacheKey({ ...base, categories: [] })
      const key2 = buildSalesCacheKey({ ...base, categories: ['furniture'] })
      const key3 = buildSalesCacheKey({ ...base, categories: ['electronics'] })
      expect(key1).not.toBe(key2)
      expect(key2).not.toBe(key3)
      expect(key1).not.toBe(key3)
    })

    it('produces different keys for different dateRange/limit/offset', () => {
      const base = {
        actualBbox: { north: 38.1, south: 38.0, east: -85.0, west: -85.1 },
        dateRange: 'any',
        startDateParam: null as string | null,
        endDateParam: null as string | null,
        categories: [] as string[],
        limit: 24,
        offset: 0,
        distanceKm: 40,
        q: null as string | null,
      }
      const keyA = buildSalesCacheKey({ ...base, dateRange: 'any' })
      const keyB = buildSalesCacheKey({ ...base, dateRange: 'this_week' })
      const keyC = buildSalesCacheKey({ ...base, limit: 48 })
      const keyD = buildSalesCacheKey({ ...base, offset: 24 })
      expect(keyA).not.toBe(keyB)
      expect(keyA).not.toBe(keyC)
      expect(keyA).not.toBe(keyD)
    })

    it('produces same key for same normalized params', () => {
      const params = {
        actualBbox: { north: 38.1, south: 38.0, east: -85.0, west: -85.1 },
        dateRange: 'any',
        startDateParam: null as string | null,
        endDateParam: null as string | null,
        categories: ['furniture'] as string[],
        limit: 24,
        offset: 0,
        distanceKm: 40,
        q: null as string | null,
      }
      expect(buildSalesCacheKey(params)).toBe(buildSalesCacheKey(params))
    })
  })

  describe('getSalesApiCache / setSalesApiCache', () => {
    it('returns null on miss, then returns value on hit after set (in-memory)', async () => {
      const key = 'test-key-1'
      const value = { ok: true, data: [] }
      expect(await getSalesApiCache(key)).toBeNull()
      await setSalesApiCache(key, value, 60)
      const hit = await getSalesApiCache(key)
      expect(hit).toEqual(value)
    })

    it('two identical public requests hit cache on second call', async () => {
      const key = buildSalesCacheKey({
        actualBbox: { north: 38.1, south: 38.0, east: -85.0, west: -85.1 },
        dateRange: 'any',
        startDateParam: null,
        endDateParam: null,
        categories: [],
        limit: 24,
        offset: 0,
        distanceKm: 40,
        q: null,
      })
      expect(await getSalesApiCache(key)).toBeNull()
      const response = { ok: true, data: [{ id: '1' }], count: 1 }
      await setSalesApiCache(key, response, 45)
      const second = await getSalesApiCache(key)
      expect(second).toEqual(response)
    })
  })
})
