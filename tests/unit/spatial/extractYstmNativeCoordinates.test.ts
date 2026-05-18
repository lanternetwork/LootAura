import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractYstmNativeCoordinatesFromHtml } from '@/lib/ingestion/spatial/extractYstmNativeCoordinates'

describe('extractYstmNativeCoordinatesFromHtml', () => {
  it('prefers const lat/lng script variables', () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-with-native-coords.html'),
      'utf8'
    )
    const coords = extractYstmNativeCoordinatesFromHtml(html)
    expect(coords).toEqual({
      lat: 41.812252210000,
      lng: -87.711150220000,
      source: 'script_const',
    })
  })

  it('falls back to Street View cbll when script vars missing', () => {
    const html = `<a href="http://www.google.com/maps?q=&layer=c&cbll=30.1,-90.2">Street View</a>`
    expect(extractYstmNativeCoordinatesFromHtml(html)).toEqual({
      lat: 30.1,
      lng: -90.2,
      source: 'street_view_cbll',
    })
  })

  it('returns null when no coordinates present', () => {
    expect(extractYstmNativeCoordinatesFromHtml('<html></html>')).toBeNull()
  })
})
