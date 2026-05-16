import { describe, expect, it } from 'vitest'
import { formatAddressForPublishedSaleDisplay } from '@/lib/ingestion/formatDisplayAddress'
import { normalizeAddressForPublish } from '@/lib/ingestion/publish'

describe('formatAddressForPublishedSaleDisplay', () => {
  it('title-cases street tokens and suffixes', () => {
    expect(formatAddressForPublishedSaleDisplay('123 main st')).toBe('123 Main St')
    expect(formatAddressForPublishedSaleDisplay('WESTERN AVE')).toBe('Western Ave')
  })

  it('formats street plus city, state ZIP tail', () => {
    expect(
      formatAddressForPublishedSaleDisplay('620 lincoln ave, winnetka, IL 60093')
    ).toBe('620 Lincoln Ave, Winnetka, IL 60093')
  })

  it('does not mutate normalizeAddressForPublish inputs (dedupe / ingest line unchanged)', () => {
    const raw = '123 MAIN ST'
    const city = 'Chicago'
    const state = 'IL'
    const normalized = normalizeAddressForPublish(raw, city, state)
    expect(raw).toBe('123 MAIN ST')
    const again = normalizeAddressForPublish(raw, city, state)
    expect(again).toBe(normalized)
    expect(formatAddressForPublishedSaleDisplay(normalized ?? '')).toContain('Main St')
  })
})
