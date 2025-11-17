import { describe, it, expect } from 'vitest'
import { buildGoogleMapsUrl, buildGoogleMapsUrlFromSale } from '@/lib/location/googleMaps'

describe('buildGoogleMapsUrl', () => {
  it('should build URL with lat/lng when both are provided', () => {
    const url = buildGoogleMapsUrl({ lat: 38.2527, lng: -85.7585 })
    expect(url).toBe('https://maps.apple.com/?ll=38.2527,-85.7585')
  })

  it('should prefer lat/lng over address when both are provided', () => {
    const url = buildGoogleMapsUrl({
      lat: 38.2527,
      lng: -85.7585,
      address: '123 Main St, Louisville, KY'
    })
    expect(url).toBe('https://maps.apple.com/?ll=38.2527,-85.7585')
  })

  it('should use address when lat/lng are not available', () => {
    const url = buildGoogleMapsUrl({ address: '123 Main St, Louisville, KY 40202' })
    expect(url).toBe('https://maps.apple.com/?q=123%20Main%20St%2C%20Louisville%2C%20KY%2040202')
  })

  it('should URL-encode address properly', () => {
    const url = buildGoogleMapsUrl({ address: '123 Main St & Broadway, Louisville, KY' })
    expect(url).toContain('123%20Main%20St%20%26%20Broadway')
    expect(url).toBe('https://maps.apple.com/?q=123%20Main%20St%20%26%20Broadway%2C%20Louisville%2C%20KY')
  })

  it('should return empty string when only lat is provided', () => {
    const url = buildGoogleMapsUrl({ lat: 38.2527 })
    expect(url).toBe('')
  })

  it('should return empty string when only lng is provided', () => {
    const url = buildGoogleMapsUrl({ lng: -85.7585 })
    expect(url).toBe('')
  })

  it('should return empty string when no data is provided', () => {
    const url = buildGoogleMapsUrl({})
    expect(url).toBe('')
  })

  it('should handle NaN lat/lng values', () => {
    const url1 = buildGoogleMapsUrl({ lat: NaN, lng: -85.7585 })
    expect(url1).toBe('')

    const url2 = buildGoogleMapsUrl({ lat: 38.2527, lng: NaN })
    expect(url2).toBe('')
  })

  it('should handle empty address string', () => {
    const url = buildGoogleMapsUrl({ address: '' })
    expect(url).toBe('')
  })

  it('should handle whitespace-only address', () => {
    const url = buildGoogleMapsUrl({ address: '   ' })
    expect(url).toBe('')
  })
})

describe('buildGoogleMapsUrlFromSale', () => {
  it('should prefer lat/lng from sale object', () => {
    const sale = {
      lat: 38.2527,
      lng: -85.7585,
      address: '123 Main St',
      city: 'Louisville',
      state: 'KY'
    }
    const url = buildGoogleMapsUrlFromSale(sale)
    expect(url).toBe('https://maps.apple.com/?ll=38.2527,-85.7585')
  })

  it('should build address from components when lat/lng are missing', () => {
    const sale = {
      address: '123 Main St',
      city: 'Louisville',
      state: 'KY',
      zip_code: '40202'
    }
    const url = buildGoogleMapsUrlFromSale(sale)
    expect(url).toBe('https://maps.apple.com/?q=123%20Main%20St%2C%20Louisville%2C%20KY%2040202')
  })

  it('should handle sale with only city and state', () => {
    const sale = {
      city: 'Louisville',
      state: 'KY'
    }
    const url = buildGoogleMapsUrlFromSale(sale)
    expect(url).toBe('https://maps.apple.com/?q=Louisville%2C%20KY')
  })

  it('should handle sale with only address', () => {
    const sale = {
      address: '123 Main St'
    }
    const url = buildGoogleMapsUrlFromSale(sale)
    expect(url).toBe('https://maps.apple.com/?q=123%20Main%20St')
  })

  it('should return empty string when sale has no location data', () => {
    const sale = {}
    const url = buildGoogleMapsUrlFromSale(sale)
    expect(url).toBe('')
  })

  it('should handle null values', () => {
    const sale = {
      lat: null,
      lng: null,
      address: null,
      city: null,
      state: null
    }
    const url = buildGoogleMapsUrlFromSale(sale)
    expect(url).toBe('')
  })

  it('should ignore null lat/lng and use address', () => {
    const sale = {
      lat: null,
      lng: null,
      address: '123 Main St',
      city: 'Louisville',
      state: 'KY'
    }
    const url = buildGoogleMapsUrlFromSale(sale)
    expect(url).toBe('https://maps.apple.com/?q=123%20Main%20St%2C%20Louisville%2C%20KY')
  })
})

