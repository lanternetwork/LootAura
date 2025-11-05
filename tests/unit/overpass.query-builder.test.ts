import { describe, it, expect } from 'vitest'
import { buildOverpassAddressQuery } from '@/lib/geo/overpass'

describe('Overpass Query Builder', () => {
  it('should build valid query for numeric prefix', () => {
    const query = buildOverpassAddressQuery('123', 38.25, -85.75, 5000, 8)
    
    expect(query).toContain('[out:json]')
    expect(query).toContain('[timeout:8]')
    expect(query).toContain('node["addr:housenumber"~"^123"]')
    expect(query).toContain('way["addr:housenumber"~"^123"]')
    expect(query).toContain('relation["addr:housenumber"~"^123"]')
    expect(query).toContain('around:5000,38.25,-85.75')
    expect(query).toContain('out center 100')
  })

  it('should include all three element types', () => {
    const query = buildOverpassAddressQuery('5001', 40.0, -80.0, 5000, 8)
    
    expect(query).toContain('node[')
    expect(query).toContain('way[')
    expect(query).toContain('relation[')
  })

  it('should use correct radius and coordinates', () => {
    const query = buildOverpassAddressQuery('12', 38.2527, -85.7585, 5000, 8)
    
    expect(query).toContain('around:5000,38.2527,-85.7585')
  })

  it('should use correct timeout', () => {
    const query = buildOverpassAddressQuery('1', 38.0, -85.0, 5000, 10)
    
    expect(query).toContain('[timeout:10]')
  })

  it('should reject invalid prefix (non-numeric)', () => {
    expect(() => {
      buildOverpassAddressQuery('abc', 38.0, -85.0, 5000, 8)
    }).toThrow('Invalid prefix')
  })

  it('should reject empty prefix', () => {
    expect(() => {
      buildOverpassAddressQuery('', 38.0, -85.0, 5000, 8)
    }).toThrow('Invalid prefix')
  })

  it('should accept 1-6 digit prefixes', () => {
    expect(() => buildOverpassAddressQuery('1', 38.0, -85.0, 5000, 8)).not.toThrow()
    expect(() => buildOverpassAddressQuery('12', 38.0, -85.0, 5000, 8)).not.toThrow()
    expect(() => buildOverpassAddressQuery('123456', 38.0, -85.0, 5000, 8)).not.toThrow()
  })

  it('should reject prefix longer than 6 digits', () => {
    expect(() => {
      buildOverpassAddressQuery('1234567', 38.0, -85.0, 5000, 8)
    }).toThrow('Invalid prefix')
  })

  it('should use regex anchor for prefix match', () => {
    const query = buildOverpassAddressQuery('500', 38.0, -85.0, 5000, 8)
    
    // Should use ^ prefix to match start of housenumber
    expect(query).toContain('"^500"')
  })
})

