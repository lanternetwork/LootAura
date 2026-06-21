import { describe, expect, it } from 'vitest'
import { buildListFastInsertFailureDetail } from '@/lib/ingestion/ystmCoverage/buildListFastInsertFailureDetail'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'

const sampleSale: YstmListMetadataSale = {
  canonicalUrl: 'https://yardsaletreasuremap.com/US/MA/Boston/x/123/userlisting.html',
  sourceUrl: 'https://yardsaletreasuremap.com/US/MA/Boston/x/123/userlisting.html',
  title: 'Garage sale',
  description: 'Lots of tools at 123 Main Street',
  address: '123 Main Street',
  lat: 42.36,
  lng: -71.05,
  startDate: '2026-06-21',
  endDate: '2026-06-22',
  postedAt: null,
  imageUrls: [],
}

describe('buildListFastInsertFailureDetail', () => {
  it('persists sanitized shape without raw address or description', () => {
    const detail = buildListFastInsertFailureDetail({
      sale: sampleSale,
      ingestRow: {
        source_platform: 'external_page_source',
        sale_instance_key: 'sale-key-abc',
      },
      insertError: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "ingested_sales_active_sale_instance_key_uniq"',
        details: 'Key (source_platform, sale_instance_key)=(external_page_source, sale-key-abc) already exists.',
      },
      insertReturnedRow: false,
      collisionResolutionAttempted: true,
      collisionResolutionSucceeded: false,
      snapshotCompleteness: 'complete_snapshot',
      recordedAt: '2026-06-20T12:00:00.000Z',
    })

    const row = detail.list_fast_insert
    expect(row).toBeDefined()
    expect(row?.messageClass).toBe('collision_resolution_failed')
    expect(row?.constraint).toBe('ingested_sales_active_sale_instance_key_uniq')
    expect(row?.hasNativeCoords).toBe(true)
    expect(JSON.stringify(detail)).not.toContain('123 Main Street')
    expect(JSON.stringify(detail)).not.toContain('Lots of tools')
    expect(JSON.stringify(detail)).not.toContain('sale-key-abc')
    expect(row?.saleInstanceKeyHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
