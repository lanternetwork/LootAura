import { describe, it, expect } from 'vitest'
import { ZipGeocodeResponse, normalizeGeocode } from '@/lib/contracts/geocode'

describe('ZIP Geocode Contract', () => {
  it('validates direct format { lat, lng }', () => {
    const response = {
      lat: 38.2380249,
      lng: -85.7246945,
      city: 'Louisville',
      state: 'KY',
      zip: '40204',
      source: 'api'
    }
    
    const result = ZipGeocodeResponse.safeParse(response)
    expect(result.success).toBe(true)
  })

  it('validates wrapped format { data: { lat, lng } }', () => {
    const response = {
      data: {
        lat: 38.2380249,
        lng: -85.7246945,
        city: 'Louisville',
        state: 'KY',
        zip: '40204',
        source: 'api'
      }
    }
    
    const result = ZipGeocodeResponse.safeParse(response)
    expect(result.success).toBe(true)
  })

  it('normalizes direct format correctly', () => {
    const response = {
      lat: 38.2380249,
      lng: -85.7246945,
      city: 'Louisville',
      state: 'KY',
      zip: '40204',
      source: 'api'
    }
    
    const normalized = normalizeGeocode(response)
    expect(normalized).toEqual({
      lat: 38.2380249,
      lng: -85.7246945,
      city: 'Louisville',
      state: 'KY',
      zip: '40204',
      source: 'api'
    })
  })

  it('normalizes wrapped format correctly', () => {
    const response = {
      data: {
        lat: 38.2380249,
        lng: -85.7246945,
        city: 'Louisville',
        state: 'KY',
        zip: '40204',
        source: 'api'
      }
    }
    
    const normalized = normalizeGeocode(response)
    expect(normalized).toEqual({
      lat: 38.2380249,
      lng: -85.7246945,
      city: 'Louisville',
      state: 'KY',
      zip: '40204',
      source: 'api'
    })
  })

  it('throws error for invalid response', () => {
    const invalidResponse = {
      latitude: 38.2380249,
      longitude: -85.7246945
    }
    
    expect(() => normalizeGeocode(invalidResponse)).toThrow('Invalid geocode response')
  })
})
