import { describe, expect, it } from 'vitest'
import {
  ESNET_REVALIDATION_ADAPTER,
  EXTERNAL_PAGE_REVALIDATION_ADAPTER,
  resolveRevalidationPlatformAdapter,
} from '@/lib/ingestion/discovery/revalidationPlatformAdapters'

describe('revalidationPlatformAdapters', () => {
  it('defaults to external page source', () => {
    expect(resolveRevalidationPlatformAdapter().sourcePlatform).toBe('external_page_source')
    expect(resolveRevalidationPlatformAdapter(undefined).adapterId).toBe(
      EXTERNAL_PAGE_REVALIDATION_ADAPTER.adapterId
    )
  })

  it('resolves estatesales_net adapter', () => {
    const adapter = resolveRevalidationPlatformAdapter('estatesales_net')
    expect(adapter.sourcePlatform).toBe('estatesales_net')
    expect(adapter.adapterId).toBe(ESNET_REVALIDATION_ADAPTER.adapterId)
    expect(adapter.getStateIndexEntries(['KY'])[0]?.indexUrl).toContain('estatesales.net/KY')
  })
})
