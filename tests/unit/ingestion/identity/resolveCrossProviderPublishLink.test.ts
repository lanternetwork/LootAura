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
    delete process.env.INGESTION_CROSS_PROVIDER_PUBLISH_LINK
    delete process.env.INGESTION_CROSS_PROVIDER_PUBLISH_ENFORCE
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
})
