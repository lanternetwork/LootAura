import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'

const LOUISVILLE_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

const CHICAGO_URL =
  'https://yardsaletreasuremap.com/US/Illinois/Chicago/6519-N-Oliphant-Ave/2439464/userlisting.html'

describe('parseYstmDetailPageFromHtml', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('parses Louisville detail fixture with address, dates, and native coords', () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-louisville-devondale.html'),
      'utf8'
    )
    const parsed = parseYstmDetailPageFromHtml({
      html,
      sourceUrl: LOUISVILLE_URL,
      configCity: 'Louisville',
      configState: 'KY',
    })

    expect(parsed).not.toBeNull()
    expect(parsed!.title).toBe('Our Biggest Yard Sale')
    expect(parsed!.addressRaw).toContain('1802 Devondale Dr')
    expect(parsed!.addressRaw).toContain('Louisville')
    expect(parsed!.city).toBe('Louisville')
    expect(parsed!.state).toBe('KY')
    expect(parsed!.startDate).toBe('2026-05-23')
    expect(parsed!.endDate).toBe('2026-05-23')
    expect(parsed!.nativeCoords).toMatchObject({
      lat: 38.276708,
      lng: -85.613833,
      source: 'script_const',
    })
    expect(parsed!.detailTimeStart).toBeTruthy()
    expect(parsed!.detailTimeEnd).toBeTruthy()
  })

  it('parses standalone Start time when no hour range is present', () => {
    const html = `<html><body>
<div class="listing">
<h1 class="content">Neighborhood Sale</h1>
<div class="content" style="margin-top:2em">
<div>6/28 - 6/28<br/>Start time: 8am</div>
<div id="address">123 Main St, Chicago, IL 60601, USA</div>
</div>
</div>
<script>const lat = 41.88; const lng = -87.63;</script>
</body></html>`
    const parsed = parseYstmDetailPageFromHtml({
      html,
      sourceUrl:
        'https://yardsaletreasuremap.com/US/Illinois/Chicago/123-Main-St/999/userlisting.html',
      configCity: 'Chicago',
      configState: 'IL',
    })

    expect(parsed).not.toBeNull()
    expect(parsed!.startDate).toBe('2026-06-28')
    expect(parsed!.detailTimeStart).toBe('08:00:00')
    expect(parsed!.detailTimeEnd).toBeUndefined()
  })

  it('parses Park Ridge / Chicago hub fixture with images and date range', () => {
    const html = readFileSync(
      join(process.cwd(), 'tests/fixtures/ystm/detail-park-ridge-chicago.html'),
      'utf8'
    )
    const parsed = parseYstmDetailPageFromHtml({
      html,
      sourceUrl: CHICAGO_URL,
      configCity: 'Chicago',
      configState: 'IL',
    })

    expect(parsed).not.toBeNull()
    expect(parsed!.title).toContain('Park Ridge')
    expect(parsed!.addressRaw).toContain('6519 N Oliphant Ave')
    expect(parsed!.city).toBe('Chicago')
    expect(parsed!.state).toBe('IL')
    expect(parsed!.startDate).toBe('2026-05-21')
    expect(parsed!.endDate).toBe('2026-05-24')
    expect(parsed!.imageUrls.length).toBeGreaterThanOrEqual(2)
    expect(parsed!.nativeCoords).toMatchObject({
      lat: 41.9987367,
      lng: -87.8199156,
    })
  })

  it('returns null when detail page has no title, address, or native coords', () => {
    const parsed = parseYstmDetailPageFromHtml({
      html: '<html><body><div class="listing"></div></body></html>',
      sourceUrl:
        'https://yardsaletreasuremap.com/US/Illinois/Chicago/Moving-Sale/999/userlisting.html',
      configCity: 'Chicago',
      configState: 'IL',
    })
    expect(parsed).toBeNull()
  })

  it('rejects Hidden #address and still parses title with native coords', () => {
    const parsed = parseYstmDetailPageFromHtml({
      html: readFileSync(
        join(process.cwd(), 'tests/fixtures/ystm/detail-edgebrook-hidden.html'),
        'utf8'
      ),
      sourceUrl:
        'https://yardsaletreasuremap.com/US/Illinois/Chicago/Edgebrook/2441446/userlisting.html',
      configCity: 'Chicago',
      configState: 'IL',
    })
    expect(parsed).not.toBeNull()
    expect(parsed!.addressRaw).toBeNull()
    expect(parsed!.addressSource).toBeNull()
    expect(parsed!.nativeCoords).toMatchObject({ lat: 41.99537, lng: -87.75367 })
  })
})
