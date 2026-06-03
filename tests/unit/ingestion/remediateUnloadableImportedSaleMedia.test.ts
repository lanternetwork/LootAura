import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fromBaseMock, updateEqMock, updateMock } = vi.hoisted(() => {
  const updateEqMock = vi.fn()
  const updateMock = vi.fn(() => ({ eq: updateEqMock }))
  const fromBaseMock = vi.fn()
  return { fromBaseMock, updateEqMock, updateMock }
})

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => fromBaseMock(...args),
}))

vi.mock('@/lib/ingestion/externalImageValidation', () => ({
  isPublishableExternalImageUrl: vi.fn(),
}))

describe('remediateUnloadableImportedSaleMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateEqMock.mockResolvedValue({ error: null })
    fromBaseMock.mockImplementation((_db: unknown, table: string) => {
      if (table === 'sales') {
        return {
          select: () => ({
            or: () => ({
              order: () => ({
                limit: async () => ({
                  data: [
                    {
                      id: 'sale-1',
                      cover_image_url: 'https://images.example.org/broken.jpg',
                      images: ['https://images.example.org/broken.jpg', 'https://images.example.org/ok.jpg'],
                      ingested_sale_id: 'ingest-1',
                      import_source: null,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
          update: updateMock,
        }
      }
      throw new Error(`unexpected table ${table}`)
    })
  })

  it('clears unloadable cover and gallery URLs on imported sales', async () => {
    const { isPublishableExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    vi.mocked(isPublishableExternalImageUrl).mockImplementation(async (url: string) =>
      url.endsWith('ok.jpg')
    )

    const { remediateUnloadableImportedSaleMedia } = await import(
      '@/lib/ingestion/images/remediateUnloadableImportedSaleMedia'
    )
    const summary = await remediateUnloadableImportedSaleMedia({ batchSize: 10, dryRun: false })

    expect(summary).toMatchObject({
      scanned: 1,
      remediated: 1,
      skipped: 0,
      clearedCoverUrls: 1,
      clearedGalleryUrls: 1,
      dryRun: false,
    })
    expect(updateMock).toHaveBeenCalledWith({
      cover_image_url: null,
      images: ['https://images.example.org/ok.jpg'],
    })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'sale-1')
  })

  it('supports dryRun without writing', async () => {
    const { isPublishableExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    vi.mocked(isPublishableExternalImageUrl).mockResolvedValue(false)

    const { remediateUnloadableImportedSaleMedia } = await import(
      '@/lib/ingestion/images/remediateUnloadableImportedSaleMedia'
    )
    const summary = await remediateUnloadableImportedSaleMedia({ batchSize: 10, dryRun: true })

    expect(summary.remediated).toBe(1)
    expect(updateMock).not.toHaveBeenCalled()
  })
})
