import { describe, expect, it } from 'vitest'
import { pickPrimaryIngestedSaleBySourceUrl } from '@/lib/ingestion/identity/ingestedSaleSourceUrlLookup'

describe('pickPrimaryIngestedSaleBySourceUrl', () => {
  it('prefers non-superseded rows when multiple share source_url', () => {
    const primary = pickPrimaryIngestedSaleBySourceUrl([
      {
        id: 'b',
        superseded_by_ingested_sale_id: 'keeper',
      },
      {
        id: 'a',
        superseded_by_ingested_sale_id: null,
      },
    ])
    expect(primary?.id).toBe('a')
  })
})
