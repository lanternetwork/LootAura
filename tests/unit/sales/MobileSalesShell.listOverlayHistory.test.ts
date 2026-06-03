import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildMobileSalesViewUrl,
  MOBILE_SALES_LIST_OVERLAY_KEY,
} from '@/app/sales/MobileSalesShell'

describe('buildMobileSalesViewUrl', () => {
  const params = new URLSearchParams('zip=90210&view=list')

  it('adds view=list for list mode', () => {
    expect(buildMobileSalesViewUrl(params, 'list')).toContain('view=list')
    expect(buildMobileSalesViewUrl(params, 'list')).toContain('zip=90210')
  })

  it('omits view for map mode', () => {
    const url = buildMobileSalesViewUrl(params, 'map')
    expect(url).not.toContain('view=list')
    expect(url).toContain('zip=90210')
  })
})

describe('MobileSalesShell list overlay history contract', () => {
  const sourcePath = path.resolve(
    process.cwd(),
    'app/sales/MobileSalesShell.tsx'
  )
  const source = readFileSync(sourcePath, 'utf-8')

  it('exports overlay history state key', () => {
    expect(MOBILE_SALES_LIST_OVERLAY_KEY).toBeTruthy()
    expect(source).toContain(MOBILE_SALES_LIST_OVERLAY_KEY)
  })

  it('pushes history when opening list from map', () => {
    expect(source).toMatch(/history\.pushState/)
    expect(source).toMatch(/openListMode/)
  })

  it('handles popstate to close list', () => {
    expect(source).toMatch(/addEventListener\(\s*['"]popstate['"]/)
    expect(source).toMatch(/closeListMode/)
  })

  it('pops overlay history on programmatic list close', () => {
    expect(source).toMatch(/history\.back\(\)/)
  })
})
