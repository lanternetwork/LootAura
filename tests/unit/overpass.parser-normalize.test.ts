import { describe, it, expect } from 'vitest'
import { parseOverpassElements, formatLabel, NormalizedAddress } from '@/lib/geo/overpass'

describe('Overpass Parser and Normalizer', () => {
  it('should parse node elements with required fields', () => {
    const json = {
      elements: [
        {
          type: 'node',
          id: 123,
          lat: 38.25,
          lon: -85.75,
          tags: {
            'addr:housenumber': '123',
            'addr:street': 'Main St',
            'addr:city': 'Louisville',
            'addr:state': 'KY',
            'addr:postcode': '40201'
          }
        }
      ]
    }

    const result = parseOverpassElements(json)
    
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'node:123',
      lat: 38.25,
      lng: -85.75,
      houseNumber: '123',
      street: 'Main St',
      city: 'Louisville',
      state: 'KY',
      postcode: '40201',
      type: 'node'
    })
  })

  it('should parse way elements with center coordinates', () => {
    const json = {
      elements: [
        {
          type: 'way',
          id: 456,
          center: {
            lat: 40.0,
            lon: -80.0
          },
          tags: {
            'addr:housenumber': '5001',
            'addr:street': 'Oak Ave',
            'addr:city': 'Pittsburgh',
            'addr:state': 'PA'
          }
        }
      ]
    }

    const result = parseOverpassElements(json)
    
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'way:456',
      lat: 40.0,
      lng: -80.0,
      houseNumber: '5001',
      street: 'Oak Ave',
      type: 'way'
    })
  })

  it('should parse relation elements', () => {
    const json = {
      elements: [
        {
          type: 'relation',
          id: 789,
          center: {
            lat: 35.0,
            lon: -90.0
          },
          tags: {
            'addr:housenumber': '12',
            'addr:street': 'Elm St'
          }
        }
      ]
    }

    const result = parseOverpassElements(json)
    
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'relation:789',
      lat: 35.0,
      lng: -90.0,
      houseNumber: '12',
      street: 'Elm St',
      type: 'relation'
    })
  })

  it('should drop elements missing housenumber', () => {
    const json = {
      elements: [
        {
          type: 'node',
          id: 123,
          lat: 38.25,
          lon: -85.75,
          tags: {
            'addr:street': 'Main St'
            // Missing addr:housenumber
          }
        }
      ]
    }

    const result = parseOverpassElements(json)
    
    expect(result).toHaveLength(0)
  })

  it('should drop elements missing street', () => {
    const json = {
      elements: [
        {
          type: 'node',
          id: 123,
          lat: 38.25,
          lon: -85.75,
          tags: {
            'addr:housenumber': '123'
            // Missing addr:street
          }
        }
      ]
    }

    const result = parseOverpassElements(json)
    
    expect(result).toHaveLength(0)
  })

  it('should handle optional address fields', () => {
    const json = {
      elements: [
        {
          type: 'node',
          id: 123,
          lat: 38.25,
          lon: -85.75,
          tags: {
            'addr:housenumber': '123',
            'addr:street': 'Main St'
            // No city, state, postcode
          }
        }
      ]
    }

    const result = parseOverpassElements(json)
    
    expect(result).toHaveLength(1)
    expect(result[0].city).toBeUndefined()
    expect(result[0].state).toBeUndefined()
    expect(result[0].postcode).toBeUndefined()
  })

  it('should prefer city over town/village', () => {
    const json = {
      elements: [
        {
          type: 'node',
          id: 123,
          lat: 38.25,
          lon: -85.75,
          tags: {
            'addr:housenumber': '123',
            'addr:street': 'Main St',
            'addr:city': 'Louisville',
            'addr:town': 'Alternative Town'
          }
        }
      ]
    }

    const result = parseOverpassElements(json)
    
    expect(result[0].city).toBe('Louisville')
  })

  it('should use town if city is missing', () => {
    const json = {
      elements: [
        {
          type: 'node',
          id: 123,
          lat: 38.25,
          lon: -85.75,
          tags: {
            'addr:housenumber': '123',
            'addr:street': 'Main St',
            'addr:town': 'Small Town'
          }
        }
      ]
    }

    const result = parseOverpassElements(json)
    
    expect(result[0].city).toBe('Small Town')
  })

  it('should format label correctly with all fields', () => {
    const addr: NormalizedAddress = {
      id: 'node:123',
      lat: 38.25,
      lng: -85.75,
      houseNumber: '123',
      street: 'Main St',
      city: 'Louisville',
      state: 'KY',
      postcode: '40201',
      type: 'node',
      upstreamIndex: 0
    }

    const label = formatLabel(addr)
    
    expect(label).toBe('123 Main St, Louisville, KY, 40201')
  })

  it('should format label with minimal fields', () => {
    const addr: NormalizedAddress = {
      id: 'node:123',
      lat: 38.25,
      lng: -85.75,
      houseNumber: '123',
      street: 'Main St',
      type: 'node',
      upstreamIndex: 0
    }

    const label = formatLabel(addr)
    
    expect(label).toBe('123 Main St')
  })

  it('should format label with city and state only', () => {
    const addr: NormalizedAddress = {
      id: 'node:123',
      lat: 38.25,
      lng: -85.75,
      houseNumber: '123',
      street: 'Main St',
      city: 'Louisville',
      state: 'KY',
      type: 'node',
      upstreamIndex: 0
    }

    const label = formatLabel(addr)
    
    expect(label).toBe('123 Main St, Louisville, KY')
  })

  it('should handle empty elements array', () => {
    const json = {
      elements: []
    }

    const result = parseOverpassElements(json)
    
    expect(result).toHaveLength(0)
  })

  it('should handle missing elements array', () => {
    const json = {}

    const result = parseOverpassElements(json)
    
    expect(result).toHaveLength(0)
  })

  it('should preserve upstreamIndex for sorting', () => {
    const json = {
      elements: [
        {
          type: 'node',
          id: 1,
          lat: 38.25,
          lon: -85.75,
          tags: {
            'addr:housenumber': '123',
            'addr:street': 'Main St'
          }
        },
        {
          type: 'node',
          id: 2,
          lat: 38.26,
          lon: -85.76,
          tags: {
            'addr:housenumber': '124',
            'addr:street': 'Main St'
          }
        }
      ]
    }

    const result = parseOverpassElements(json)
    
    expect(result[0].upstreamIndex).toBe(0)
    expect(result[1].upstreamIndex).toBe(1)
  })
})

