import { describe, expect, it } from 'vitest'
import { isEsnetIngestEnabled, parserVersionForEsnetPlatform } from '@/lib/ingestion/estatesalesnet/constants'

describe('estatesalesnet constants', () => {
  it('defaults ingest flag to disabled', () => {
    expect(isEsnetIngestEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(
      isEsnetIngestEnabled({ ESNET_INGEST_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)
    ).toBe(true)
  })

  it('uses list parser version for esnet platform', () => {
    expect(parserVersionForEsnetPlatform('estatesales_net')).toBe('estatesales_net_list_v1')
    expect(parserVersionForEsnetPlatform('external_page_source')).toBe('external_page_source_mvp_v3')
  })
})
