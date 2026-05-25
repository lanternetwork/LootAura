import { describe, expect, it } from 'vitest'
import { parserVersionForEsnetPlatform } from '@/lib/ingestion/estatesalesnet/constants'

describe('estatesalesnet/constants', () => {
  it('selects list vs detail parser versions', () => {
    expect(parserVersionForEsnetPlatform('estatesales_net')).toBe('estatesales_net_list_v1')
    expect(parserVersionForEsnetPlatform('estatesales_net', { detailEnriched: true })).toBe(
      'estatesales_net_detail_v1'
    )
    expect(parserVersionForEsnetPlatform('external_page_source')).toBe('external_page_source_mvp_v3')
  })
})
