import { describe, it, expect } from 'vitest'
import { resolveMetroExistence } from '@/lib/seo/resolveMetroExistence'

describe('resolveMetroExistence', () => {
  it('exists for qualified override with zero inventory and history', () => {
    const result = resolveMetroExistence({
      slug: 'louisville-ky',
      inventoryDbCount: 0,
      historicalCount90d: 0,
      qualifiedOverride: true,
    })
    expect(result.exists).toBe(true)
    expect(result.qualifiedOverride).toBe(true)
    expect(result.seededMajor).toBe(true)
  })

  it('exists for non-override metro with inventory rows', () => {
    const result = resolveMetroExistence({
      slug: 'bardstown-ky',
      inventoryDbCount: 5,
      historicalCount90d: 0,
      qualifiedOverride: false,
    })
    expect(result.exists).toBe(true)
    expect(result.qualifiedOverride).toBe(false)
  })

  it('exists for historical footprint without current inventory', () => {
    const result = resolveMetroExistence({
      slug: 'bardstown-ky',
      inventoryDbCount: 0,
      historicalCount90d: 3,
      qualifiedOverride: false,
    })
    expect(result.exists).toBe(true)
  })

  it('does not exist for unknown slug with no signals', () => {
    const result = resolveMetroExistence({
      slug: 'asdfasdfasdf',
      inventoryDbCount: 0,
      historicalCount90d: 0,
      qualifiedOverride: false,
    })
    expect(result.exists).toBe(false)
  })
})
