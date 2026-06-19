import { describe, expect, it } from 'vitest'
import { extractYstmListMetadataSales } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'

describe('extractYstmListMetadataSales', () => {
  it('extracts full metadata rows from metadataStr', () => {
    const detailUrl =
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/8559-s-main-st/listing.html'
    const html = `
      <html><body><script>
        metadataStr = '{"sales":[{"url":"${detailUrl}","title":"Big sale","address":"8559 S Main St, Chicago, IL","start_date":"2026-07-10","end_date":"2026-07-11","lat":41.7,"lng":-87.6}]}';
      </script></body></html>
    `
    const rows = extractYstmListMetadataSales(html, 'https://yardsaletreasuremap.com/US/Illinois/Chicago.html')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('Big sale')
    expect(rows[0]?.startDate).toBe('2026-07-10')
    expect(rows[0]?.lat).toBe(41.7)
    expect(rows[0]?.canonicalUrl).toContain('listing.html')
  })

  it('includes sale.php URLs from metadataStr', () => {
    const salePhp =
      'https://yardsaletreasuremap.com/sale.php?communitysale=12871&id=218927'
    const html = `<script>metadataStr = '{"sales":[{"url":"${salePhp}","title":"Community sale","date":"2026-07-15","address":"1 Main St, Louisville, KY"}]}';</script>`
    const rows = extractYstmListMetadataSales(html, 'https://yardsaletreasuremap.com/US/Kentucky/Louisville.html')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sourceUrl).toBe(salePhp)
  })
})
