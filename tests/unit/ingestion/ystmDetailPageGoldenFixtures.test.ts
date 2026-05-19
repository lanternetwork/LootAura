import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseYstmDetailPageFromHtml } from '@/lib/ingestion/acquisition/parseYstmDetailPageFromHtml'
import { YSTM_DETAIL_PAGE_GOLDEN_EXPECTATIONS } from '../../fixtures/ystm/ystmDetailPageGoldenExpectations'

describe('YSTM detail page golden fixtures', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(YSTM_DETAIL_PAGE_GOLDEN_EXPECTATIONS)(
    '$name matches golden expectations',
    (golden) => {
      const html = readFileSync(
        join(process.cwd(), 'tests/fixtures/ystm', golden.fixtureFile),
        'utf8'
      )
      const parsed = parseYstmDetailPageFromHtml({
        html,
        sourceUrl: golden.sourceUrl,
        configCity: golden.configCity,
        configState: golden.configState,
      })

      if (golden.expectNull) {
        expect(parsed).toBeNull()
        return
      }

      expect(parsed).not.toBeNull()

      if (golden.title instanceof RegExp) {
        expect(parsed!.title).toMatch(golden.title)
      } else if (golden.title != null) {
        expect(parsed!.title).toBe(golden.title)
      }

      for (const fragment of golden.addressContains ?? []) {
        expect(parsed!.addressRaw).toContain(fragment)
      }

      if (golden.city != null) expect(parsed!.city).toBe(golden.city)
      if (golden.state != null) expect(parsed!.state).toBe(golden.state)
      if (golden.startDate != null) expect(parsed!.startDate).toBe(golden.startDate)
      if (golden.endDate != null) expect(parsed!.endDate).toBe(golden.endDate)
      if (golden.minImageUrls != null) {
        expect(parsed!.imageUrls.length).toBeGreaterThanOrEqual(golden.minImageUrls)
      }
      if (golden.nativeCoords != null) {
        expect(parsed!.nativeCoords).toMatchObject(golden.nativeCoords)
      }
    }
  )
})
