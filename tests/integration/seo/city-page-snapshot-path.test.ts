import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd())

function readPage(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('city page heavy path removal', () => {
  it('yard-sales metro page does not import inventory SEO emission', () => {
    const src = readPage('app/yard-sales/[metroSlug]/page.tsx')
    expect(src).not.toContain('getInventorySeoEmissionForRequest')
    expect(src).not.toContain('getSeoMetrosForRequest')
    expect(src).not.toContain('fetchMetroInventory')
    expect(src).toContain('loadMetroPageContext')
    expect(src).toContain('revalidate = 3600')
  })

  it('weekend metro page does not import inventory SEO emission', () => {
    const src = readPage('app/yard-sales-this-weekend/[metroSlug]/page.tsx')
    expect(src).not.toContain('getInventorySeoEmissionForRequest')
    expect(src).not.toContain('getSeoMetrosForRequest')
    expect(src).not.toMatch(/fetchMetroWeekendInventory\s*\(/)
    expect(src).toContain('loadMetroPageContext')
    expect(src).toContain('revalidate = 3600')
  })
})
