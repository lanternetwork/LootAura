import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isSharedMetroHubSlug,
  validateDiscoveredCityPage,
} from '@/lib/ingestion/discovery/sourceDiscoveryValidator'

const FIXTURES = join(process.cwd(), 'tests/fixtures/ingestion/discovery')

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

describe('validateDiscoveredCityPage', () => {
  it('accepts city page with listing anchors', () => {
    const html = loadFixture('city_page_with_listings.html')
    const result = validateDiscoveredCityPage({
      html,
      pageUrl: 'https://yardsaletreasuremap.com/US/Indiana/Munster.html',
      city: 'Munster',
      state: 'IN',
    })
    expect(result).toEqual({ ok: true, kind: 'valid_city_page' })
  })

  it('accepts valid empty city page with explicit empty signals', () => {
    const html = loadFixture('city_page_valid_empty.html')
    const result = validateDiscoveredCityPage({
      html,
      pageUrl: 'https://yardsaletreasuremap.com/US/Illinois/Oak-Brook.html',
      city: 'Oak Brook',
      state: 'IL',
    })
    expect(result).toEqual({ ok: true, kind: 'valid_empty_city_page' })
  })

  it('rejects page with city page markers but no listings and no empty-valid signals', () => {
    const html = `<!DOCTYPE html><html><body>
      <p class="tagline">Your guide to local garage sales, community sales, and hidden treasures</p>
      <h1>Garage Sales & Yard Sales in Testville, Illinois</h1>
    </body></html>`
    const result = validateDiscoveredCityPage({
      html,
      pageUrl: 'https://yardsaletreasuremap.com/US/Illinois/Testville.html',
      city: 'Testville',
      state: 'IL',
    })
    expect(result).toEqual({ ok: false, reason: 'empty_page_missing_valid_empty_signals' })
  })

  it('rejects malformed non-source city page', () => {
    const html = loadFixture('malformed_page.html')
    const result = validateDiscoveredCityPage({
      html,
      pageUrl: 'https://yardsaletreasuremap.com/US/Illinois/Testville.html',
      city: 'Testville',
      state: 'IL',
    })
    expect(result.ok).toBe(false)
  })

  it('rejects non-HTTPS page URL', () => {
    const html = loadFixture('city_page_with_listings.html')
    const result = validateDiscoveredCityPage({
      html,
      pageUrl: 'http://yardsaletreasuremap.com/US/Indiana/Munster.html',
      city: 'Munster',
      state: 'IN',
    })
    expect(result).toEqual({ ok: false, reason: 'source_page_not_https' })
  })
})

describe('isSharedMetroHubSlug', () => {
  it('flags Chicago.html hub segment', () => {
    expect(isSharedMetroHubSlug('Chicago.html')).toBe(true)
  })

  it('does not flag ordinary city pages', () => {
    expect(isSharedMetroHubSlug('Munster.html')).toBe(false)
  })

  it('normalizes slug to municipality without .html artifact', () => {
    expect(isSharedMetroHubSlug('Chicago.html')).toBe(true)
    expect(isSharedMetroHubSlug('Chicago')).toBe(true)
  })
})
