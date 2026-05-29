import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildCrawlSmokeUrl } from '@/lib/seo/crawlSmoke'

const originalEnv = process.env

describe('buildCrawlSmokeUrl', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NEXT_PUBLIC_SITE_URL: 'https://lootaura.app' }
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('builds same-origin paths from configured site URL', () => {
    expect(buildCrawlSmokeUrl('/yard-sales/dallas-tx')).toBe(
      'https://lootaura.app/yard-sales/dallas-tx'
    )
  })

  it('rejects protocol-relative paths', () => {
    expect(() => buildCrawlSmokeUrl('//evil.example/path')).toThrow(/Invalid crawl smoke path/)
  })

  it('rejects absolute URLs (only site-relative paths allowed)', () => {
    expect(() => buildCrawlSmokeUrl('https://evil.example/path')).toThrow(/Invalid crawl smoke path/)
  })
})
