import { describe, expect, it } from 'vitest'
import { isYstmStateShellCityPageUrl } from '@/lib/ingestion/discovery/ystmCityListPageUrl'

describe('isYstmStateShellCityPageUrl', () => {
  it('detects state shell city pages', () => {
    expect(
      isYstmStateShellCityPageUrl('https://yardsaletreasuremap.com/US/Illinois/Illinois.html')
    ).toBe(true)
  })

  it('accepts real city list pages', () => {
    expect(
      isYstmStateShellCityPageUrl('https://yardsaletreasuremap.com/US/Illinois/Chicago.html')
    ).toBe(false)
  })
})
