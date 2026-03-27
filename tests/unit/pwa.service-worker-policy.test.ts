import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const SW_PATH = path.resolve(process.cwd(), 'public/sw.js')

describe('PWA service worker safety policy', () => {
  it('does not broadly cache authenticated or API/dynamic document traffic', () => {
    const source = fs.readFileSync(SW_PATH, 'utf-8')
    expect(source).toContain("request.mode === 'navigate'")
    expect(source).toContain("request.destination === 'document'")
    expect(source).toContain("url.pathname.startsWith('/api/')")
    expect(source).toContain('url.search')
  })

  it('is network-first for static assets and supports safe update signal', () => {
    const source = fs.readFileSync(SW_PATH, 'utf-8')
    expect(source).toContain('fetch(request)')
    expect(source).toContain('caches.match(request)')
    expect(source).toContain("event.data.type === 'SKIP_WAITING'")
  })
})
