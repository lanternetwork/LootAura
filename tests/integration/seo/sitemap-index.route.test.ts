import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/app/sitemap', () => ({
  generateSitemaps: vi.fn(async () => [{ id: 'static' }, { id: 'listings-0' }]),
}))

vi.mock('@/lib/seo/constants', () => ({
  getSeoBaseUrl: () => 'https://lootaura.com',
}))

describe('GET /sitemap.xml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 sitemap index referencing active segments', async () => {
    const { GET } = await import('@/app/sitemap.xml/route')
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/xml')

    const xml = await response.text()
    expect(xml).toContain('<sitemapindex')
    expect(xml).toContain('https://lootaura.com/sitemap/static.xml')
    expect(xml).toContain('https://lootaura.com/sitemap/listings-0.xml')
  })
})
