import { describe, expect, it } from 'vitest'
import { extractEsnetCityPageCandidatesFromStateIndexHtml } from '@/lib/ingestion/estatesalesnet/discovery/extractEsnetCityPageCandidates'
import { buildEsnetStateIndexUrl } from '@/lib/ingestion/estatesalesnet/discovery/esnetStateIndexCatalog'

describe('extractEsnetCityPageCandidatesFromStateIndexHtml', () => {
  it('extracts metro list URLs from state index anchors', () => {
    const html = `
      <a href="/KY/Louisville">Louisville</a>
      <a href="/KY/Lexington">Lexington</a>
      <a href="/KY/Louisville/40222/4913946">sale</a>
      <a href="/OH/Cincinnati">other state</a>
    `
    const candidates = extractEsnetCityPageCandidatesFromStateIndexHtml(html, {
      stateCode: 'KY',
      indexUrl: buildEsnetStateIndexUrl('KY'),
    })
    const urls = candidates.map((c) => c.canonicalUrl).sort()
    expect(urls).toEqual([
      'https://www.estatesales.net/KY/Lexington',
      'https://www.estatesales.net/KY/Louisville',
    ])
  })
})
