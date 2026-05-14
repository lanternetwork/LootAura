import { describe, expect, it } from 'vitest'
import { resolveSourceRefreshCapability } from '@/lib/reconciliation/reconciliationRefreshCapability'

describe('reconciliationRefreshCapability', () => {
  it('defaults known hosts to server_refetch_supported', () => {
    expect(
      resolveSourceRefreshCapability({
        sourcePlatform: 'external_page_source',
        sourceHost: 'yardsaletreasuremap.com',
      })
    ).toBe('server_refetch_supported')
  })

  it('marks empty host unsupported', () => {
    expect(
      resolveSourceRefreshCapability({
        sourcePlatform: 'external_page_source',
        sourceHost: '   ',
      })
    ).toBe('unsupported_for_reconciliation')
  })
})
