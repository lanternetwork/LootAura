import { describe, it, expect } from 'vitest'
import {
  normalizeZipForValidation,
  batchStatuses,
  deterministicSpread,
  deterministicScatter,
  scatterSeed,
  buildBatchReport,
  buildCreatedSaleFromCreateResponse,
  isCompleteZipResolution,
} from '@/lib/admin/testSalesSpread'

describe('normalizeZipForValidation (ZIP validation)', () => {
  it('accepts 5-digit ZIPs', () => {
    expect(normalizeZipForValidation('40202')).toBe('40202')
    expect(normalizeZipForValidation('02115')).toBe('02115')
    expect(normalizeZipForValidation('12345')).toBe('12345')
  })

  it('strips non-digits and takes first 5', () => {
    expect(normalizeZipForValidation('40202-1234')).toBe('40202')
    expect(normalizeZipForValidation('40202')).toBe('40202')
    expect(normalizeZipForValidation('123-45')).toBe('12345')
  })

  it('pads short numeric input with leading zeros', () => {
    expect(normalizeZipForValidation('1')).toBe('00001')
    expect(normalizeZipForValidation('12')).toBe('00012')
    expect(normalizeZipForValidation('1234')).toBe('01234')
  })

  it('returns null for empty or non-numeric-only input', () => {
    expect(normalizeZipForValidation('')).toBe(null)
    expect(normalizeZipForValidation('abc')).toBe(null)
    expect(normalizeZipForValidation('   ')).toBe(null)
  })

})

describe('batchStatuses (count and published-only shape)', () => {
  it('published-only: all published', () => {
    expect(batchStatuses(1, true)).toEqual(['published'])
    expect(batchStatuses(5, true)).toEqual(['published', 'published', 'published', 'published', 'published'])
    expect(batchStatuses(10, true)).toHaveLength(10)
    expect(batchStatuses(10, true).every((s) => s === 'published')).toBe(true)
  })

  it('count 0 returns empty array', () => {
    expect(batchStatuses(0, true)).toEqual([])
    expect(batchStatuses(0, false)).toEqual([])
  })

  it('when not published-only: count 1 is single published', () => {
    expect(batchStatuses(1, false)).toEqual(['published'])
  })

  it('when not published-only: count 2 is published + draft', () => {
    expect(batchStatuses(2, false)).toEqual(['published', 'draft'])
  })

  it('when not published-only: count 3+ has published, then 1 draft, 1 archived', () => {
    const s3 = batchStatuses(3, false)
    expect(s3).toHaveLength(3)
    expect(s3.filter((x) => x === 'published')).toHaveLength(1)
    expect(s3.filter((x) => x === 'draft')).toHaveLength(1)
    expect(s3.filter((x) => x === 'archived')).toHaveLength(1)

    const s5 = batchStatuses(5, false)
    expect(s5).toHaveLength(5)
    expect(s5.filter((x) => x === 'published')).toHaveLength(3)
    expect(s5.filter((x) => x === 'draft')).toHaveLength(1)
    expect(s5.filter((x) => x === 'archived')).toHaveLength(1)
  })
})

describe('isCompleteZipResolution (generator fail-fast guard)', () => {
  it('returns true when city and state are present and valid', () => {
    expect(isCompleteZipResolution({ city: 'West Hollywood', state: 'CA' })).toBe(true)
    expect(isCompleteZipResolution({ city: 'Louisville', state: 'KY' })).toBe(true)
    expect(isCompleteZipResolution({ city: 'Beverly Hills', state: 'CA' })).toBe(true)
  })

  it('returns false when city is missing, blank, or Unknown', () => {
    expect(isCompleteZipResolution({ city: '', state: 'CA' })).toBe(false)
    expect(isCompleteZipResolution({ city: 'Unknown', state: 'CA' })).toBe(false)
    expect(isCompleteZipResolution({ city: '   ', state: 'CA' })).toBe(false)
    expect(isCompleteZipResolution({ state: 'CA' })).toBe(false)
    expect(isCompleteZipResolution({ city: null, state: 'CA' })).toBe(false)
  })

  it('returns false when state is missing, blank, or too short', () => {
    expect(isCompleteZipResolution({ city: 'West Hollywood', state: '' })).toBe(false)
    expect(isCompleteZipResolution({ city: 'West Hollywood', state: '   ' })).toBe(false)
    expect(isCompleteZipResolution({ city: 'West Hollywood', state: 'C' })).toBe(false)
    expect(isCompleteZipResolution({ city: 'West Hollywood' })).toBe(false)
    expect(isCompleteZipResolution({ city: 'West Hollywood', state: null })).toBe(false)
  })

  it('zero create attempts: report shape when guard blocks (requested 0, succeeded 0)', () => {
    const report = buildBatchReport(0, 0, '90069', 'Unknown', '', null)
    expect(report.requested).toBe(0)
    expect(report.succeeded).toBe(0)
    expect(report.failureMessage).toBeNull()
  })
})

describe('buildCreatedSaleFromCreateResponse (no crash when API returns only saleId)', () => {
  it('builds CreatedSale from saleId and request fields', () => {
    const sale = buildCreatedSaleFromCreateResponse(
      { saleId: 'abc-123' },
      'Garage Sale - published',
      'published',
      '2025-06-15'
    )
    expect(sale.id).toBe('abc-123')
    expect(sale.title).toBe('Garage Sale - published')
    expect(sale.status).toBe('published')
    expect(sale.date_start).toBe('2025-06-15')
  })

  it('accepts id when saleId is missing', () => {
    const sale = buildCreatedSaleFromCreateResponse(
      { id: 'fallback-id' },
      'Title',
      'draft',
      '2025-01-01'
    )
    expect(sale.id).toBe('fallback-id')
  })

  it('throws when no sale id returned', () => {
    expect(() =>
      buildCreatedSaleFromCreateResponse({}, 'Title', 'published', '2025-01-01')
    ).toThrow('no sale id returned')
  })

  it('created-sales list items are always defined (no undefined)', () => {
    const items = [
      buildCreatedSaleFromCreateResponse({ saleId: '1' }, 'A', 'published', '2025-01-01'),
      buildCreatedSaleFromCreateResponse({ saleId: '2' }, 'B', 'published', '2025-01-02'),
    ]
    items.forEach((item) => {
      expect(item).toBeDefined()
      expect(item.id).toBeDefined()
      expect(item.title).toBeDefined()
      expect(item.status).toBeDefined()
      expect(item.date_start).toBeDefined()
    })
  })
})

describe('deterministicScatter (deterministic scatter, no grid)', () => {
  const centerLat = 38.25
  const centerLng = -85.76
  const radius = 0.015
  const seed = scatterSeed('40202', 8, radius)

  it('same inputs produce same outputs', () => {
    const a = deterministicScatter(centerLat, centerLng, 8, radius, seed)
    const b = deterministicScatter(centerLat, centerLng, 8, radius, seed)
    expect(a).toHaveLength(8)
    expect(b).toHaveLength(8)
    expect(a).toEqual(b)
  })

  it('scatterSeed is stable for same zip + count + radius', () => {
    expect(scatterSeed('40202', 8, 0.015)).toBe(scatterSeed('40202', 8, 0.015))
    expect(scatterSeed('90210', 5, 0.01)).not.toBe(scatterSeed('40202', 8, 0.015))
  })

  it('count 0 or negative returns empty array', () => {
    expect(deterministicScatter(centerLat, centerLng, 0, radius, seed)).toEqual([])
    expect(deterministicScatter(centerLat, centerLng, -1, radius, seed)).toEqual([])
  })

  it('count 1 returns center point', () => {
    const one = deterministicScatter(centerLat, centerLng, 1, radius, seed)
    expect(one).toEqual([{ lat: centerLat, lng: centerLng }])
  })

  it('radius 0 returns empty for count > 1', () => {
    expect(deterministicScatter(centerLat, centerLng, 5, 0, seed)).toEqual([])
  })

  it('output length equals requested count', () => {
    expect(deterministicScatter(centerLat, centerLng, 6, radius, seed)).toHaveLength(6)
    expect(deterministicScatter(centerLat, centerLng, 50, radius, seed)).toHaveLength(50)
  })

  it('points are within radius of center', () => {
    const points = deterministicScatter(centerLat, centerLng, 12, radius, seed)
    const latRad = (centerLat * Math.PI) / 180
    const lngScale = 1 / Math.cos(latRad)
    points.forEach((p) => {
      const dLat = p.lat - centerLat
      const dLng = (p.lng - centerLng) * lngScale
      const dist = Math.sqrt(dLat * dLat + dLng * dLng)
      expect(dist).toBeLessThanOrEqual(radius * 1.01)
    })
  })

  it('no obvious grid: points are not in perfect rows/columns', () => {
    const points = deterministicScatter(centerLat, centerLng, 9, radius, seed)
    const lats = points.map((p) => p.lat)
    const lngs = points.map((p) => p.lng)
    const uniqueLats = [...new Set(lats.map((x) => Math.round(x * 10000)))]
    const uniqueLngs = [...new Set(lngs.map((x) => Math.round(x * 10000)))]
    expect(uniqueLats.length).toBeGreaterThan(2)
    expect(uniqueLngs.length).toBeGreaterThan(2)
  })

  it('minimum spacing: no two points stacked (all pairs have meaningful separation)', () => {
    const points = deterministicScatter(centerLat, centerLng, 10, radius, seed)
    const minAllowed = radius * 0.01
    const latRad = (centerLat * Math.PI) / 180
    const lngScale = 1 / Math.cos(latRad)
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]!
        const b = points[j]!
        const dLat = a.lat - b.lat
        const dLng = (a.lng - b.lng) * lngScale
        const dist = Math.sqrt(dLat * dLat + dLng * dLng)
        expect(dist).toBeGreaterThan(minAllowed)
      }
    }
  })
})

describe('deterministicSpread (legacy wrapper)', () => {
  const centerLat = 38.25
  const centerLng = -85.76
  const radius = 0.01

  it('same inputs produce same outputs', () => {
    const a = deterministicSpread(centerLat, centerLng, 8, radius)
    const b = deterministicSpread(centerLat, centerLng, 8, radius)
    expect(a).toHaveLength(8)
    expect(b).toEqual(a)
  })

  it('count 1 returns center point', () => {
    expect(deterministicSpread(centerLat, centerLng, 1, radius)).toEqual([
      { lat: centerLat, lng: centerLng },
    ])
  })

  it('output length equals requested count', () => {
    expect(deterministicSpread(centerLat, centerLng, 6, radius)).toHaveLength(6)
  })
})

describe('buildBatchReport (partial-failure reporting)', () => {
  it('report includes requested, succeeded, zip, city, state, failureMessage', () => {
    const r = buildBatchReport(5, 3, '40202', 'Louisville', 'KY', 'Something failed')
    expect(r.requested).toBe(5)
    expect(r.succeeded).toBe(3)
    expect(r.zip).toBe('40202')
    expect(r.city).toBe('Louisville')
    expect(r.state).toBe('KY')
    expect(r.failureMessage).toBe('Something failed')
  })

  it('partial failure: succeeded < requested and failureMessage set', () => {
    const r = buildBatchReport(10, 7, '90210', 'Beverly Hills', 'CA', 'Rate limit')
    expect(r.succeeded).toBeLessThan(r.requested)
    expect(r.failureMessage).toBe('Rate limit')
  })

  it('full success: failureMessage null', () => {
    const r = buildBatchReport(5, 5, '40202', 'Louisville', 'KY', null)
    expect(r.succeeded).toBe(r.requested)
    expect(r.failureMessage).toBeNull()
  })
})
