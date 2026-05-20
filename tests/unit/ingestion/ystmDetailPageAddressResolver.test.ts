import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  extractAddressFromJsonLd,
  extractAddressFromOnClickDirectionsScript,
  isPublishableYstmDetailAddressCandidate,
  isYstmPlaceholderAddressLine,
  resolveDetailFirstMergedAddressRaw,
  resolveYstmDetailPageAddress,
  shouldSuppressListSeedAddressForDetailFirst,
  ystmDetailChosenAddressSourceKey,
} from '@/lib/ingestion/acquisition/ystmDetailPageAddressResolver'

describe('ystmDetailPageAddressResolver', () => {
  it('treats Hidden and similar as placeholders', () => {
    expect(isYstmPlaceholderAddressLine('Hidden')).toBe(true)
    expect(isYstmPlaceholderAddressLine('see map')).toBe(true)
    expect(isPublishableYstmDetailAddressCandidate('Hidden')).toBe(false)
  })

  it('accepts numbered street lines', () => {
    expect(isPublishableYstmDetailAddressCandidate('1929 W Montrose Ave, Chicago, IL')).toBe(true)
  })

  it('extracts onClickDirections address from script', () => {
    const html = `function onClickDirections() {
      const address = "1929 W Montrose Ave, Chicago, IL 60613, USA";
    }`
    expect(extractAddressFromOnClickDirectionsScript(html)).toBe(
      '1929 W Montrose Ave, Chicago, IL 60613, USA'
    )
  })

  it('extracts JSON-LD Event streetAddress', () => {
    const html = `<script type="application/ld+json">
    {"@type":"Event","location":{"@type":"Place","name":"1929 W Montrose Ave","address":{"@type":"PostalAddress","streetAddress":"1929 W Montrose Ave, Chicago, IL 60613, USA"}}}
    </script>`
    expect(extractAddressFromJsonLd(html)).toContain('1929 W Montrose Ave')
  })

  it('maps address source to chosenAddressSource key', () => {
    expect(ystmDetailChosenAddressSourceKey('json_ld')).toBe('ystm_detail_json_ld')
    expect(ystmDetailChosenAddressSourceKey('detail_dom')).toBe('ystm_detail_dom')
  })

  it('suppresses list seed address when detail has native coords only', () => {
    const detailPage = {
      addressSource: null,
      addressRaw: null,
      nativeCoords: { lat: 41.92775, lng: -87.70562 },
    }
    expect(shouldSuppressListSeedAddressForDetailFirst(detailPage)).toBe(true)
    expect(
      resolveDetailFirstMergedAddressRaw(detailPage, {
        addressRaw: 'Logan Square Moving Sale',
      })
    ).toBeNull()
  })

  it('skips Hidden #address and uses script directions', () => {
    const html =
      '<div id="address">Hidden</div>' +
      '<script>function onClickDirections(){const address="500 W Fullerton Ave, Chicago, IL";}</script>'
    const dom = new JSDOM(html).window.document
    const resolved = resolveYstmDetailPageAddress({
      document: dom,
      html,
      sourceUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago/500-W-Fullerton/1/userlisting.html',
      configCity: 'Chicago',
      configState: 'IL',
    })
    expect(resolved.addressSource).toBe('script_directions')
    expect(resolved.addressRaw).toContain('500 W Fullerton')
  })
})
