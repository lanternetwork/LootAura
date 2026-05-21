import { describe, expect, it } from 'vitest'
import { buildCoverageMissingIngestionContext } from '@/lib/ingestion/ystmCoverage/ystmCoverageMissingListSeed'

const DETAIL_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'

describe('buildCoverageMissingIngestionContext', () => {
  it('builds detail-first config and list seed from observation row', () => {
    const { config, listSeed, rowPayload } = buildCoverageMissingIngestionContext({
      canonicalUrl: DETAIL_URL,
      city: 'Louisville',
      state: 'KY',
    })

    expect(config.city).toBe('Louisville')
    expect(config.state).toBe('KY')
    expect(config.source_platform).toBe('external_page_source')
    expect(listSeed.sourceUrl).toBe(DETAIL_URL)
    expect(listSeed.rawPayload).toMatchObject({ externalId: '38754131', coverageMissingIngest: true })
    expect(rowPayload).toMatchObject({ coverage_missing_ingest: true })
  })

  it('falls back to URL path municipality when observation city/state missing', () => {
    const { config, listSeed } = buildCoverageMissingIngestionContext({
      canonicalUrl: DETAIL_URL,
      city: null,
      state: null,
    })

    expect(config.city).toBe('Louisville')
    expect(config.state).toBe('KY')
    expect(listSeed.city).toBe('Louisville')
    expect(listSeed.state).toBe('KY')
  })
})
