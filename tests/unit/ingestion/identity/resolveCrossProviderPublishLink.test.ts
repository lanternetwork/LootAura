import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const canonical = 'a'.repeat(64)
const PRIMARY_INGESTED_ID = '11111111-1111-4111-8111-111111111111'
const INCOMING_ID = '22222222-2222-4222-8222-222222222222'
const PUBLISHED_SALE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const mockFromBase = vi.fn()

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

describe('resolveCrossProviderPublishLink', () => {
  const priorEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INGESTION_CROSS_PROVIDER_PUBLISH_LINK = 'true'
  })

  afterEach(() => {
    process.env = { ...priorEnv }
    vi.resetModules()
  })

  it('returns null when flag is off', async () => {
    process.env.INGESTION_CROSS_PROVIDER_PUBLISH_LINK = 'false'
    process.env.INGESTION_CROSS_PROVIDER_ENFORCEMENT = 'false'
    const { resolveCrossProviderPublishLink } = await import(
      '@/lib/ingestion/identity/resolveCrossProviderPublishLink'
    )
    const result = await resolveCrossProviderPublishLink({
      id: INCOMING_ID,
      source_platform: 'estatesales_net',
      canonical_sale_instance_key: canonical,
    })
    expect(result).toBeNull()
    expect(mockFromBase).not.toHaveBeenCalled()
  })

  it('links to a published cross-platform sibling by canonical key', async () => {
    mockFromBase.mockImplementation((_admin: unknown, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                not: () => ({
                  is: () => ({
                    order: () => ({
                      order: () => ({
                        limit: async () => ({
                          data: [
                            {
                              id: PRIMARY_INGESTED_ID,
                              source_platform: 'external_page_source',
                              published_sale_id: PUBLISHED_SALE_ID,
                              is_duplicate: false,
                            },
                          ],
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [{ id: PUBLISHED_SALE_ID }], error: null }),
            }),
          }),
        }
      }
      return {}
    })

    const { resolveCrossProviderPublishLink } = await import(
      '@/lib/ingestion/identity/resolveCrossProviderPublishLink'
    )
    const result = await resolveCrossProviderPublishLink({
      id: INCOMING_ID,
      source_platform: 'estatesales_net',
      canonical_sale_instance_key: canonical,
    })

    expect(result).toEqual({
      publishedSaleId: PUBLISHED_SALE_ID,
      primaryIngestedSaleId: PRIMARY_INGESTED_ID,
      matchedIngestedSaleId: PRIMARY_INGESTED_ID,
      matchMethod: 'canonical_published_sibling',
    })
    expect(mockFromBase).toHaveBeenCalled()
  })

  it('links to a published same-platform sibling by canonical key (YSTM↔YSTM)', async () => {
    const KEEPER_ID = '33333333-3333-4333-8333-333333333333'
    mockFromBase.mockImplementation((_admin: unknown, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                not: () => ({
                  is: () => ({
                    order: () => ({
                      order: () => ({
                        limit: async () => ({
                          data: [
                            {
                              id: KEEPER_ID,
                              source_platform: 'external_page_source',
                              published_sale_id: PUBLISHED_SALE_ID,
                              is_duplicate: false,
                            },
                          ],
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [{ id: PUBLISHED_SALE_ID }], error: null }),
            }),
          }),
        }
      }
      return {}
    })

    const { resolveCrossProviderPublishLink } = await import(
      '@/lib/ingestion/identity/resolveCrossProviderPublishLink'
    )
    const result = await resolveCrossProviderPublishLink({
      id: INCOMING_ID,
      source_platform: 'external_page_source',
      canonical_sale_instance_key: canonical,
    })

    expect(result).toEqual({
      publishedSaleId: PUBLISHED_SALE_ID,
      primaryIngestedSaleId: KEEPER_ID,
      matchedIngestedSaleId: KEEPER_ID,
      matchMethod: 'canonical_published_sibling_same_platform',
    })
  })

  it('prefers same-platform sibling when both same and cross-platform exist', async () => {
    const CROSS_PLATFORM_ID = '44444444-4444-4444-8444-444444444444'
    const SAME_PLATFORM_ID = '55555555-5555-4555-8555-555555555555'
    const SAME_SALE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    mockFromBase.mockImplementation((_admin: unknown, table: string) => {
      if (table === 'ingested_sales') {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                not: () => ({
                  is: () => ({
                    order: () => ({
                      order: () => ({
                        limit: async () => ({
                          data: [
                            {
                              id: CROSS_PLATFORM_ID,
                              source_platform: 'estatesales_net',
                              published_sale_id: PUBLISHED_SALE_ID,
                              is_duplicate: false,
                            },
                            {
                              id: SAME_PLATFORM_ID,
                              source_platform: 'external_page_source',
                              published_sale_id: SAME_SALE,
                              is_duplicate: false,
                            },
                          ],
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'sales') {
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [{ id: SAME_SALE }], error: null }),
            }),
          }),
        }
      }
      return {}
    })

    const { resolveCrossProviderPublishLink } = await import(
      '@/lib/ingestion/identity/resolveCrossProviderPublishLink'
    )
    const result = await resolveCrossProviderPublishLink({
      id: INCOMING_ID,
      source_platform: 'external_page_source',
      canonical_sale_instance_key: canonical,
    })

    expect(result?.publishedSaleId).toBe(SAME_SALE)
    expect(result?.matchMethod).toBe('canonical_published_sibling_same_platform')
    expect(result?.matchedIngestedSaleId).toBe(SAME_PLATFORM_ID)
  })
})
