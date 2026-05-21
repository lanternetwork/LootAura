import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  extractCityPageCandidatesFromStateIndexHtml,
  isEmptyStateHtmlShellIndex,
} from '@/lib/ingestion/discovery/sourceDiscovery'
import { getVerifiedStateIndexEntries } from '@/lib/ingestion/discovery/sourceStateIndexCatalog'

const FIXTURES = join(process.cwd(), 'tests/fixtures/ingestion/discovery')

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

describe('extractCityPageCandidatesFromStateIndexHtml', () => {
  it('extracts HTTPS city .html links from Illinois directory index', () => {
    const html = loadFixture('state_index_illinois_dir.html')
    const [entry] = getVerifiedStateIndexEntries(['IL'])
    const candidates = extractCityPageCandidatesFromStateIndexHtml(html, entry)
    expect(candidates.length).toBeGreaterThan(50)
    const chicago = candidates.find((c) => c.city === 'Chicago')
    expect(chicago).toMatchObject({
      state: 'IL',
      canonicalUrl: 'https://yardsaletreasuremap.com/US/Illinois/Chicago.html',
      sharedHubPage: true,
    })
    expect(chicago?.city).not.toMatch(/\.html/i)
  })

  it('extracts Indiana cities from snippet fixture', () => {
    const html = loadFixture('state_index_indiana_dir_snippet.html')
    const [entry] = getVerifiedStateIndexEntries(['IN'])
    const candidates = extractCityPageCandidatesFromStateIndexHtml(html, entry)
    expect(candidates.map((c) => c.city).sort()).toEqual(['Griffith', 'Munster', 'Saint John'])
    expect(candidates.every((c) => c.canonicalUrl.startsWith('https://'))).toBe(true)
  })

  it('dedupes duplicate hrefs in index', () => {
    const html = `<ul>
      <li><a href='/US/Indiana/Munster.html'>A</a></li>
      <li><a href='/US/Indiana/Munster.html'>B</a></li>
    </ul>`
    const [entry] = getVerifiedStateIndexEntries(['IN'])
    const candidates = extractCityPageCandidatesFromStateIndexHtml(html, entry)
    expect(candidates).toHaveLength(1)
  })

  it('rejects state shell .html URLs that mirror the state segment', () => {
    const html = `<ul>
      <li><a href='/US/Illinois/Illinois.html'>shell</a></li>
      <li><a href='/US/Illinois/Oak-Lawn.html'>good</a></li>
    </ul>`
    const [entry] = getVerifiedStateIndexEntries(['IL'])
    const candidates = extractCityPageCandidatesFromStateIndexHtml(html, entry)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.city).toBe('Oak Lawn')
  })

  it('rejects listing detail URLs', () => {
    const html = `<ul>
      <li><a href='/US/Illinois/Chicago/123-Main-St/1/listing.html'>bad</a></li>
      <li><a href='/US/Illinois/Oak-Lawn.html'>good</a></li>
    </ul>`
    const [entry] = getVerifiedStateIndexEntries(['IL'])
    const candidates = extractCityPageCandidatesFromStateIndexHtml(html, entry)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.city).toBe('Oak Lawn')
  })
})

describe('isEmptyStateHtmlShellIndex', () => {
  it('detects empty Illinois.html shell without city links', () => {
    const html = loadFixture('state_index_empty_shell.html')
    expect(isEmptyStateHtmlShellIndex(html)).toBe(true)
  })

  it('detects non-empty Illinois directory index', () => {
    const html = loadFixture('state_index_illinois_dir.html')
    expect(isEmptyStateHtmlShellIndex(html)).toBe(false)
  })
})

describe('getVerifiedStateIndexEntries', () => {
  it('uses directory index URLs not .html shells', () => {
    const [il] = getVerifiedStateIndexEntries(['IL'])
    expect(il.indexUrl).toBe('https://yardsaletreasuremap.com/US/Illinois/')
    expect(il.indexUrl).not.toMatch(/Illinois\.html\/?$/)
  })
})
